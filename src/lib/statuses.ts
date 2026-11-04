// LANCER statuses and conditions (core rules), from @massif/lancer-data.
import statuses from "@massif/lancer-data/lib/statuses.json";
import type { CombatantState } from "./types";
import { STATUS_PT } from "./i18n";

export interface StatusInfo {
  id: string;
  name: string;
  type: "Status" | "Condition";
  terse: string;
  effects: string;
}

const AS_CONDITION = new Set(["exposed", "prone"]);

export const STATUSES: StatusInfo[] = (statuses as unknown as StatusInfo[]).map((s) => ({
  id: s.id,
  name: STATUS_PT[s.id]?.name ?? s.name,
  // Exposto and Caído are treated as conditions at this table (the data lists them as statuses).
  type: s.type === "Condition" || AS_CONDITION.has(s.id) ? "Condition" : "Status",
  terse: STATUS_PT[s.id]?.terse ?? s.terse ?? "",
  effects: s.effects ?? "",
}));
// Pseudo-status shown while a character is Braced (not a rules status, but useful on the token).
STATUSES.push({
  id: "braced",
  name: "Preparado",
  type: "Status",
  terse: "Usou Preparar: +1 Dificuldade em ataques contra ele até o fim do próximo turno dele; sem reações.",
  effects: "",
});

const byId = new Map(STATUSES.map((s) => [s.id, s]));

export function statusInfo(id: string): StatusInfo | undefined {
  return byId.get(id);
}

/** Statuses derived from the numbers rather than toggled by hand. */
export function derivedStatuses(c: CombatantState): string[] {
  const out: string[] = [];
  if (c.heatcap > 0 && c.heat >= Math.ceil(c.heatcap / 2)) out.push("dangerzone");
  if (c.br) out.push("braced");
  return out;
}

/** Active ids, statuses first and conditions after (same order as on the token). */
export function activeStatuses(c: CombatantState): string[] {
  const ids = Array.from(new Set([...(c.st ?? []), ...derivedStatuses(c)]));
  const rank = (id: string) => (statusInfo(id)?.type === "Condition" ? 1 : 0);
  return ids.sort((a, b) => rank(a) - rank(b));
}
