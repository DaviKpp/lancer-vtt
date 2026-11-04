// Core-book LANCER data from Massif Press (@massif/lancer-data).
// Used to resolve item IDs in older (v2) COMP/CON exports, which only store IDs,
// and for tag names. Newer (v3) exports embed each item's data, so LCP content works too.
import frames from "@massif/lancer-data/lib/frames.json";
import weapons from "@massif/lancer-data/lib/weapons.json";
import systems from "@massif/lancer-data/lib/systems.json";
import mods from "@massif/lancer-data/lib/mods.json";
import talents from "@massif/lancer-data/lib/talents.json";
import skills from "@massif/lancer-data/lib/skills.json";
import coreBonuses from "@massif/lancer-data/lib/core_bonuses.json";
import tags from "@massif/lancer-data/lib/tags.json";
import pilotGear from "@massif/lancer-data/lib/pilot_gear.json";
import manufacturers from "@massif/lancer-data/lib/manufacturers.json";
import { lcpStore, type LcpTable } from "./lcp";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyData = Record<string, any>;

function index(list: unknown): Map<string, AnyData> {
  const map = new Map<string, AnyData>();
  if (Array.isArray(list)) for (const x of list as AnyData[]) if (x && x.id) map.set(x.id, x);
  return map;
}

const tables = {
  frames: index(frames),
  weapons: index(weapons),
  systems: index(systems),
  mods: index(mods),
  talents: index(talents),
  skills: index(skills),
  coreBonuses: index(coreBonuses),
  tags: index(tags),
  pilotGear: index(pilotGear),
  manufacturers: index(manufacturers),
};

export type Table = keyof typeof tables | "npcClasses" | "npcFeatures" | "npcTemplates";

const LCP_NAME: Partial<Record<Table, LcpTable>> = {
  frames: "frames",
  weapons: "weapons",
  systems: "systems",
  mods: "mods",
  talents: "talents",
  coreBonuses: "core_bonuses",
  tags: "tags",
  pilotGear: "pilot_gear",
  manufacturers: "manufacturers",
  npcClasses: "npc_classes",
  npcFeatures: "npc_features",
  npcTemplates: "npc_templates",
};

/** Core-book data first, then content packs (.lcp) the GM imported. */
export function lookup(table: Table, id: string | undefined | null): AnyData | undefined {
  if (!id) return undefined;
  const builtIn = table in tables ? tables[table as keyof typeof tables].get(id) : undefined;
  const packTable = LCP_NAME[table];
  return builtIn ?? (packTable ? lcpStore.lookup(packTable, id) : undefined);
}

/** "mw_assault_rifle" -> "Assault Rifle" for items we cannot resolve. */
export function prettifyId(id: string): string {
  return id
    .replace(/^(mf|mw|ms|mm|t|sk|cb|pg|npcc|npcf|npct|tg)_/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Portuguese names for core tags. */
const TAG_PT: Record<string, string> = {
  "tg_burn": "Queimadura {VAL}",
  "tg_heat_target": "Calor {VAL} (Alvo)",
  "tg_line": "Linha {VAL}",
  "tg_cone": "Cone {VAL}",
  "tg_blast": "Explosão {VAL}",
  "tg_burst": "Pulso {VAL}",
  "tg_accurate": "Preciso",
  "tg_arcing": "Arqueado",
  "tg_ap": "Perfurante (AP)",
  "tg_inaccurate": "Impreciso",
  "tg_knockback": "Empurrão {VAL}",
  "tg_loading": "Recarregável",
  "tg_loading_after": "Recarregável (Múltiplos Usos)",
  "tg_ordnance": "Artilharia",
  "tg_overkill": "Overkill",
  "tg_overshield": "Sobrescudo",
  "tg_reliable": "Confiável {VAL}",
  "tg_seeking": "Teleguiado",
  "tg_smart": "Inteligente",
  "tg_threat": "Ameaça {VAL}",
  "tg_thrown": "Arremessável {VAL}",
  "tg_turn": "{VAL}/Turno",
  "tg_round": "{VAL}/Rodada",
  "tg_ai": "IA",
  "tg_danger_zone": "Zona de Perigo",
  "tg_deployable": "Implantável",
  "tg_drone": "Drone",
  "tg_full_action": "Ação Inteira",
  "tg_grenade": "Granada",
  "tg_heat_self": "Calor {VAL} (Próprio)",
  "tg_limited": "Limitado {VAL}",
  "tg_mine": "Mina",
  "tg_mod": "Mod",
  "tg_protocol": "Protocolo",
  "tg_quick_action": "Ação Rápida",
  "tg_reaction": "Reação",
  "tg_shield": "Escudo",
  "tg_unique": "Único",
  "tg_archaic": "Arcaico",
  "tg_personal_armor": "Armadura Pessoal",
  "tg_pilot_weapon": "Arma de Piloto",
  "tg_gear": "Equipamento",
  "tg_sidearm": "Arma Secundária",
  "tg_invade": "Invadir",
  "tg_quick_tech": "Tech Rápida",
  "tg_full_tech": "Tech Inteira",
  "tg_free_action": "Ação Livre",
  "tg_range": "Alcance ({VAL})",
  "tg_modded": "Modificado",
  "tg_resistance": "Resistência",
  "tg_exotic": "Equipamento Exótico",
  "tg_recharge": "Recarga {VAL}+",
  "tg_unlimited": "Ilimitado",
  "tg_indestructible": "Indestrutível",
  "tg_invulnerable": "Invulnerável",
  "tg_invisible": "Invisível",
  "tg_resistall": "Resistência (Tudo)",
  "tg_no_cascade": "Impede Cascata",
  "tg_irreducible": "Irredutível",
  "tg_npc_system": "Sistema de NPC",
  "tg_npc_weapon": "Arma de NPC",
  "tg_npc_trait": "Característica de NPC",
  "tg_npc_reaction": "Reação de NPC",
  "tg_npc_tech": "Ação Tech de NPC"
};

export function tagName(id: string, val?: string | number): string {
  const tag = lookup("tags", id);
  const raw: string = TAG_PT[id] ?? tag?.name ?? prettifyId(id);
  return raw.replace(/\{VAL\}/g, val === undefined ? "X" : String(val));
}

export function manufacturerName(id: string | undefined): string {
  if (!id) return "";
  return lookup("manufacturers", id)?.name ?? id;
}
