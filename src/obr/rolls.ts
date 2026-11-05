// Attack / tech attack rolls, shared with everyone in the room over broadcast.
import OBR from "@owlbear-rodeo/sdk";
import type { CombatantState, DamageEntry, RollResult } from "../lib/types";
import { rollAccuracy, rollDie, rollExpression } from "../lib/dice";
import { uid } from "../lib/util";
import { ROLL_CHANNEL } from "./constants";
import { announce } from "./announce";
import { tr } from "../lib/i18n";

const MAX_LOG = 60;
export const APPLIED_NOTE = "Dano aplicado";
export const OUTCOME_PT = { hit: "ACERTO", miss: "ERRO", crit: "CRÍTICO" } as const;

class RollLog {
  private entries: RollResult[] = [];
  private listeners = new Set<() => void>();
  private key = "";
  private started = false;

  start(roomId: string) {
    if (this.started) return;
    this.started = true;
    this.key = `lancer-vtt:${roomId}:rolls`;
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) this.entries = JSON.parse(raw);
    } catch {
      this.entries = [];
    }
    OBR.broadcast.onMessage(ROLL_CHANNEL, (event) => this.add(event.data as RollResult));
  }

  list() {
    return this.entries;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  add(r: RollResult) {
    if (!r || !r.id || this.entries.some((e) => e.id === r.id)) return;
    this.entries = [r, ...this.entries].slice(0, MAX_LOG);
    try {
      localStorage.setItem(this.key, JSON.stringify(this.entries));
    } catch {
      // ignore
    }
    this.listeners.forEach((fn) => fn());
  }

  markApplied(id: string) {
    this.entries = this.entries.map((e) => (e.id === id ? { ...e, notes: [...(e.notes ?? []), APPLIED_NOTE] } : e));
    this.listeners.forEach((fn) => fn());
  }

  clear() {
    this.entries = [];
    try {
      localStorage.removeItem(this.key);
    } catch {
      // ignore
    }
    this.listeners.forEach((fn) => fn());
  }
}

export const rollLog = new RollLog();

export async function publishRoll(r: RollResult) {
  rollLog.add(r);
  await OBR.broadcast.sendMessage(ROLL_CHANNEL, r, { destination: "REMOTE" });
  if (r.kind === "skill") {
    await announce(
      `${r.attackerName}: ${r.label} ${r.total} (alvo ${r.defense}) — ${r.outcome === "hit" ? "SUCESSO" : "FALHA"}`,
      r.outcome === "hit" ? "SUCCESS" : "WARNING",
    );
    return;
  }
  if (r.kind === "check") {
    await announce(`${r.attackerName}: ${r.label} (menor ${r.total})${r.applied?.length ? ` — ${r.applied.join(", ")}` : ""}`, "WARNING");
    return;
  }
  if (r.kind === "action") {
    await announce(`${r.attackerName}: ${r.label}${r.notes?.length ? ` — ${r.notes.join(" · ")}` : ""}`, "INFO");
    return;
  }
  const outcome = r.outcome ? ` — ${OUTCOME_PT[r.outcome]}` : "";
  const dmg = r.damage?.length ? ` (${r.damage.map((d) => `${d.amount} ${tr(d.type)}`).join(", ")})` : "";
  await announce(
    `${r.attackerName}: ${r.label} ${r.total}${r.targetName ? ` contra ${r.targetName}` : ""}${outcome}${dmg}`,
    r.outcome === "miss" ? "WARNING" : r.outcome ? "SUCCESS" : "INFO",
  );
}

export interface AttackInput {
  kind: "attack" | "tech";
  attacker: CombatantState;
  target?: CombatantState;
  label: string;
  bonus: number; // grit / tech attack / NPC attack bonus
  accuracy: number; // positive = accuracy, negative = difficulty
  damage?: DamageEntry[];
  bonusDamage?: string; // e.g. "1d6"
  reliable?: number; // Reliable X: deals X damage even on a miss
  burn?: number; // Burn X tag: X burn damage on a hit (also marked as burn)
  defense?: number; // overrides the target's Evasion / E-Defense (Smart, Stunned...)
  effect?: string; // shown when the attack hits
  critEffect?: string; // added on a critical hit
  by: { id: string; name: string };
  notes?: string[];
}

/**
 * LANCER attack: 1d20 + bonus ± highest of N d6 (net accuracy/difficulty)
 * vs. Evasion (attacks) or E-Defense (tech attacks). Weapon attacks crit on 20+.
 */
export function rollAttack(input: AttackInput): RollResult {
  const d20 = rollDie(20);
  const acc = rollAccuracy(input.accuracy);
  const total = d20 + input.bonus + acc.mod;
  const defense =
    input.defense ?? (input.target ? (input.kind === "tech" ? input.target.edef : input.target.evasion) : undefined);
  let outcome: RollResult["outcome"];
  if (defense !== undefined) {
    if (total < defense) outcome = "miss";
    else outcome = input.kind === "attack" && total >= 20 ? "crit" : "hit";
  } else if (input.kind === "attack" && total >= 20) outcome = "crit";

  let damage: RollResult["damage"];
  const hit = outcome === undefined || outcome !== "miss";
  if (hit && input.damage?.length) {
    const crit = outcome === "crit";
    damage = input.damage.map((d) => {
      const r = rollExpression(d.val, crit);
      return { type: d.type, amount: r.total, detail: r.detail };
    });
    if (input.bonusDamage) {
      const r = rollExpression(input.bonusDamage, crit);
      damage.push({ type: "Bonus", amount: r.total, detail: r.detail });
    }
  }

  if (hit && outcome !== undefined && input.burn) {
    damage = [...(damage ?? []), { type: "Burn", amount: input.burn, detail: `Queimadura ${input.burn}` }];
  }

  // Reliable X: the weapon always deals at least X damage, even on a miss.
  if (input.reliable && input.damage?.length) {
    if (outcome === "miss") {
      damage = [{ type: input.damage[0].type, amount: input.reliable, detail: `Confiável ${input.reliable}` }];
    } else if (damage?.length && damage[0].amount < input.reliable) {
      damage[0] = { ...damage[0], amount: input.reliable, detail: `${damage[0].detail} → Confiável ${input.reliable}` };
    }
  }

  return {
    id: uid(),
    ts: Date.now(),
    by: input.by.name,
    byId: input.by.id,
    attackerId: input.attacker.id,
    attackerName: input.attacker.name,
    targetId: input.target?.id,
    targetName: input.target?.name,
    kind: input.kind,
    label: input.label,
    d20,
    accDice: acc.dice,
    netAccuracy: input.accuracy,
    bonus: input.bonus,
    total,
    defense,
    outcome,
    damage,
    notes: input.notes,
    effect:
      outcome === "miss"
        ? undefined
        : [input.effect, outcome === "crit" && input.critEffect ? `<b>Crítico:</b> ${input.critEffect}` : ""]
            .filter(Boolean)
            .join("<br>") || undefined,
  };
}
