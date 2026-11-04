/* eslint-disable @typescript-eslint/no-explicit-any */
import { parsePilot, type ParsedPilot } from "./pilot";
import { isNpcData, parseNpc, type ParsedNpc } from "./npc";

export type { ParsedPilot, ParsedNpc };

export interface ImportResult {
  pilots: ParsedPilot[];
  npcs: ParsedNpc[];
  errors: string[];
}

function unwrap(json: any): any {
  return json && typeof json === "object" && "EXPORT_TYPE" in json && json.data ? json.data : json;
}

function isPilotData(d: any): boolean {
  return !!d && Array.isArray(d.mechs) && (d.callsign !== undefined || d.itemType === "pilot");
}

/** Accepts a pilot, an NPC, an array of either, or a COMP/CON encounter export. */
export function parseCompcon(input: unknown): ImportResult {
  const result: ImportResult = { pilots: [], npcs: [], errors: [] };
  const visit = (raw: any) => {
    const d = unwrap(raw);
    if (Array.isArray(d)) return d.forEach(visit);
    if (!d || typeof d !== "object") return;
    try {
      if (isPilotData(d)) result.pilots.push(parsePilot(d));
      else if (isNpcData(d)) result.npcs.push(parseNpc(d));
      else if (Array.isArray(d.combatants)) {
        // encounter export: combatants[].actor
        for (const c of d.combatants) {
          const actor = c?.actor;
          if (actor && isNpcData(actor)) result.npcs.push(parseNpc(actor));
        }
      } else if (Array.isArray(d.npcs)) d.npcs.forEach(visit);
      else result.errors.push("O arquivo não é uma exportação de piloto, NPC ou encontro do COMP/CON.");
    } catch (e) {
      result.errors.push(`Não foi possível ler "${d.name ?? d.callsign ?? "item"}": ${(e as Error).message}`);
    }
  };
  visit(input);
  return result;
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text);
}
