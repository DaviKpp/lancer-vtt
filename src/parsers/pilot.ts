/* eslint-disable @typescript-eslint/no-explicit-any */
// Parses COMP/CON pilot exports (v2 and v3 formats) into MechSheets.
//
// v3 exports embed each item's full data (`weapon.data`, `system.data`, `frameData`),
// so LCP content works. v2 exports only carry IDs, which we resolve against the
// bundled core-book data.
import type {
  ActionEntry,
  CombatantState,
  CoreSystemInfo,
  MechSheet,
  MechStats,
  PilotInfo,
  SheetMount,
  SheetSystem,
  SheetWeapon,
  TagEntry,
} from "../lib/types";
import { lookup, manufacturerName, prettifyId, tagName } from "../lib/compendium";
import { num, toText, uid } from "../lib/util";
import { statusesOf } from "../lib/effects";
import { portraitOf } from "../lib/images";

type Bonus = { id: string; val?: any; replace?: boolean };

const TECH_ACTIVATIONS = ["invade", "quick tech", "full tech"];

function parseTags(raw: any): TagEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && t.id)
    .map((t) => ({ id: t.id, name: tagName(t.id, t.val), val: t.val }));
}

function parseActions(raw: any): ActionEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => ({
    name: a.name ?? "Action",
    activation: a.activation,
    trigger: a.trigger,
    detail: toText(a.detail),
    frequency: a.frequency,
    statuses: statusesOf(a),
  }));
}

function evalBonus(val: any, ctx: { grit: number; level: number }): number | undefined {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return undefined;
  const s = val.replace(/\{grit\}/gi, String(ctx.grit)).replace(/\{ll\}/gi, String(ctx.level)).replace(/\s+/g, "");
  if (!/^[-+]?\d+([-+]\d+)*$/.test(s)) return undefined;
  return (s.match(/[-+]?\d+/g) ?? []).reduce((a, b) => a + Number(b), 0);
}

function collectBonuses(data: any, out: Bonus[]) {
  if (!data) return;
  if (Array.isArray(data.bonuses)) out.push(...data.bonuses);
}

/** Resolve an item from a v3 save entry ({ id, data }) or a v2 entry ({ id }). */
function resolve(table: Parameters<typeof lookup>[0], entry: any, warnings: string[]): any {
  if (!entry) return undefined;
  if (entry.data && typeof entry.data === "object" && entry.data.name) return entry.data;
  const found = lookup(table, entry.id);
  if (!found && entry.id) warnings.push(`Item desconhecido "${entry.id}" (content pack não incluído)`);
  return found;
}

function parseWeapon(w: any, mountAccuracy: number, warnings: string[]): SheetWeapon | null {
  if (!w || !w.id) return null;
  let data = resolve("weapons", w, warnings) ?? { id: w.id, name: prettifyId(w.id) };
  // Multi-profile weapons: merge the selected profile over the base data.
  if (Array.isArray(data.profiles) && data.profiles.length) {
    const p = data.profiles[num(w.selectedProfile, 0)] ?? data.profiles[0];
    data = { ...data, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)), name: data.name };
    if (p.name && data.profiles.length > 1) data.name = `${data.name} (${p.name})`;
  }
  const tags = parseTags(w.customTags ?? data.tags);
  let accuracy = mountAccuracy;
  if (tags.some((t) => t.id === "tg_accurate")) accuracy += 1;
  if (tags.some((t) => t.id === "tg_inaccurate")) accuracy -= 1;
  const type = String(w.customWeaponType ?? data.type ?? "");
  const damage = (Array.isArray(data.damage) ? data.damage : []).map((d: any) => ({
    type: w.customDamageType ?? d.type ?? "Kinetic",
    val: String(d.val ?? 0),
  }));
  const range = (Array.isArray(w.customRange) ? w.customRange : Array.isArray(data.range) ? data.range : []).map(
    (r: any) => ({ type: r.type ?? "Range", val: String(r.val ?? r.value ?? "") }),
  );
  let mod: SheetWeapon["mod"];
  if (w.mod && w.mod.id) {
    const md = resolve("mods", w.mod, warnings);
    mod = { name: md?.name ?? prettifyId(w.mod.id), effect: toText(md?.effect) };
  }
  const name = w.flavorName ? `${w.flavorName} (${data.name})` : data.name;
  return {
    uid: uid(),
    id: w.id,
    name,
    mount: data.mount ?? "",
    type,
    damage,
    range,
    tags,
    effect: toText(w.customEffect ?? data.effect),
    onAttack: toText(data.on_attack),
    onHit: toText(data.on_hit),
    onCrit: toText(data.on_crit),
    hitStatuses: statusesOf(data.on_hit),
    critStatuses: statusesOf(data.on_crit),
    sp: data.sp,
    mod,
    accuracy,
    destroyed: !!w.destroyed,
    actions: parseActions(data.actions),
    isMelee: /melee/i.test(type),
  };
}

function parseMount(name: string, m: any, warnings: string[]): SheetMount | null {
  if (!m) return null;
  const bonusNames: string[] = [];
  let mountAccuracy = 0;
  for (const b of m.bonus_effects ?? []) {
    const id = typeof b === "string" ? b : b?.id;
    const cb = typeof b === "object" && b?.name ? b : lookup("coreBonuses", id);
    bonusNames.push(cb?.name ?? prettifyId(id ?? "bonus"));
    if (Array.isArray(cb?.bonuses)) for (const x of cb.bonuses) if (x.id === "mount_accuracy") mountAccuracy += num(x.val, 1);
  }
  const slots = [...(m.slots ?? []), ...(m.extra ?? [])];
  const weapons = slots.map((s: any) => parseWeapon(s?.weapon, mountAccuracy, warnings)).filter(Boolean) as SheetWeapon[];
  if (!weapons.length) return null;
  return { name, weapons, bonuses: bonusNames };
}

function parseSystem(s: any, integrated: boolean, warnings: string[], bonuses: Bonus[]): SheetSystem | null {
  if (!s || !s.id) return null;
  const data = resolve("systems", s, warnings) ?? { id: s.id, name: prettifyId(s.id) };
  collectBonuses(data, bonuses);
  const actions = parseActions(data.actions);
  // Deployables (drones, turrets, cover...) are deployed as a Quick Action unless stated otherwise.
  const hadActions = actions.length > 0;
  for (const d of Array.isArray(data.deployables) ? data.deployables : []) {
    const declared = d.activation && d.activation !== "None" ? d.activation : undefined;
    const activation = declared ?? (hadActions ? undefined : "Quick");
    if (activation) actions.push({ name: `Implantar ${d.name ?? "implantável"}`, activation, detail: toText(d.detail) });
  }
  const isTech =
    /tech/i.test(String(data.type ?? "")) ||
    actions.some((a) => TECH_ACTIVATIONS.includes(String(a.activation ?? "").toLowerCase()));
  return {
    uid: uid(),
    id: s.id,
    name: s.flavorName ? `${s.flavorName} (${data.name})` : data.name,
    type: data.type,
    sp: data.sp,
    effect: toText(data.effect),
    tags: parseTags(data.tags),
    actions,
    integrated,
    destroyed: !!s.destroyed,
    isTech,
  };
}

function parseCore(core: any): CoreSystemInfo | null {
  if (!core) return null;
  return {
    name: core.name ?? "Core System",
    description: toText(core.description),
    passiveName: core.passive_name,
    passiveEffect: toText(core.passive_effect),
    activeName: core.active_name ?? core.name ?? "Core Power",
    activeEffect: toText(core.active_effect) ?? "",
    activation: core.activation,
    use: core.use,
  };
}

function parsePilotInfo(p: any, warnings: string[], bonuses: Bonus[]): PilotInfo {
  const level = num(p.level, 0);
  const grit = Math.ceil(level / 2);
  const ms = Array.isArray(p.mechSkills) ? p.mechSkills : [0, 0, 0, 0];

  const skills = (p.skills ?? []).map((s: any) => {
    if (s.custom) return { name: s.id, rank: num(s.rank, 1), description: s.custom_desc };
    const d = resolve("skills", s, warnings);
    return { name: d?.name ?? prettifyId(s.id), rank: num(s.rank, 1), description: d?.description };
  });

  const talents = (p.talents ?? []).map((t: any) => {
    const d = resolve("talents", t, warnings);
    const rank = num(t.rank, 1);
    const ranks = (d?.ranks ?? []).slice(0, rank);
    for (const r of ranks) collectBonuses(r, bonuses);
    return {
      name: d?.name ?? prettifyId(t.id),
      rank,
      ranks: ranks.map((r: any) => ({ name: r.name, description: toText(r.description) ?? "", actions: parseActions(r.actions) })),
    };
  });

  const coreBonuses = (p.core_bonuses ?? []).map((cb: any) => {
    const d = typeof cb === "object" && cb?.name ? cb : lookup("coreBonuses", typeof cb === "string" ? cb : cb?.id);
    if (!d) warnings.push(`Bônus de núcleo desconhecido "${typeof cb === "string" ? cb : cb?.id}"`);
    collectBonuses(d, bonuses);
    return { name: d?.name ?? prettifyId(String(cb?.id ?? cb)), effect: toText(d?.effect) ?? "" };
  });

  const licenses = (p.licenses ?? []).map((l: any) => ({
    name: l.stub?.name ?? lookup("frames", l.id)?.name ?? prettifyId(l.id ?? ""),
    rank: num(l.rank, 1),
  }));

  // Pilot gear: v3 has loadouts[active_index], v2 has loadout.
  const pl = Array.isArray(p.loadouts) ? p.loadouts[num(p.active_index, 0)] ?? p.loadouts[0] : p.loadout;
  const gear: string[] = [];
  const weapons: SheetWeapon[] = [];
  const pilotBonuses: Bonus[] = [];
  for (const group of ["armor", "weapons", "gear"]) {
    for (const g of pl?.[group] ?? []) {
      if (!g || !g.id) continue;
      const d = g.data?.name ? g.data : lookup("pilotGear", g.id);
      gear.push(g.flavorName || d?.name || prettifyId(g.id));
      collectBonuses(d, pilotBonuses);
      if (group === "weapons" && d && (d.damage?.length || d.range?.length)) weapons.push(pilotWeapon(g, d));
    }
  }

  const pilot = {
    hp: 6 + grit,
    armor: 0,
    evasion: 10,
    edef: 10,
    speed: 4,
  };
  for (const b of pilotBonuses) {
    const key = ({ pilot_hp: "hp", pilot_armor: "armor", pilot_evasion: "evasion", pilot_edef: "edef", pilot_speed: "speed" } as const)[
      b.id as "pilot_hp"
    ];
    const v = evalBonus(b.val, { grit, level });
    if (!key || v === undefined) continue;
    pilot[key] = b.replace ? v : pilot[key] + v;
  }
  // v3 exports carry computed pilot stats; prefer them when present.
  const max = p.stats?.max;
  if (max && num(max.hp) > 0) {
    pilot.hp = num(max.hp, pilot.hp);
    pilot.armor = num(max.armor, pilot.armor);
    pilot.evasion = num(max.evasion, pilot.evasion) || pilot.evasion;
    pilot.edef = num(max.edef, pilot.edef) || pilot.edef;
    pilot.speed = num(max.speed, pilot.speed) || pilot.speed;
  }

  return {
    name: p.name ?? "",
    image: portraitOf(p),
    callsign: p.callsign ?? "",
    playerName: p.player_name ?? "",
    level,
    grit,
    background: p.background ?? "",
    hase: { hull: num(ms[0]), agi: num(ms[1]), sys: num(ms[2]), eng: num(ms[3]) },
    ...pilot,
    skills,
    talents,
    coreBonuses,
    licenses,
    gear,
    weapons,
  };
}

/** A pilot weapon (pilot_gear "Weapon"): melee when its only range is Threat. */
function pilotWeapon(g: any, d: any): SheetWeapon {
  const tags = parseTags(g.customTags ?? d.tags);
  let accuracy = 0;
  if (tags.some((t) => t.id === "tg_accurate")) accuracy += 1;
  if (tags.some((t) => t.id === "tg_inaccurate")) accuracy -= 1;
  // Signature weapons have a "variable" damage type the player picks in COMP/CON
  const damage = (Array.isArray(d.damage) ? d.damage : []).map((x: any) => ({
    type: g.customDamageType ?? (/variable/i.test(x.type ?? "") ? g.damageType ?? x.type : x.type) ?? "Kinetic",
    val: String(x.val ?? 0),
  }));
  const range = (Array.isArray(g.customRange) ? g.customRange : Array.isArray(d.range) ? d.range : []).map((r: any) => ({ type: r.type ?? "Range", val: String(r.val ?? r.value ?? "") }));
  return {
    uid: uid(),
    id: g.id,
    name: g.flavorName ? `${g.flavorName} (${d.name})` : d.name ?? prettifyId(g.id),
    mount: "Pilot",
    type: "Pilot Weapon",
    damage,
    range,
    tags,
    effect: toText(d.effect),
    onHit: toText(d.on_hit),
    onCrit: toText(d.on_crit),
    hitStatuses: statusesOf(d.on_hit),
    critStatuses: statusesOf(d.on_crit),
    accuracy,
    actions: parseActions(d.actions),
    isMelee: range.length > 0 && range.every((r: { type: string }) => /threat/i.test(r.type)),
  };
}

const STAT_BONUS_KEYS: Record<string, keyof MechStats> = {
  hp: "hp",
  armor: "armor",
  evasion: "evasion",
  edef: "edef",
  heatcap: "heatcap",
  repcap: "repcap",
  sensor: "sensor",
  tech_attack: "techAttack",
  save: "save",
  speed: "speed",
  structure: "structure",
  stress: "stress",
  sp: "sp",
  limited_bonus: "limitedBonus",
  size: "size",
};

function computeStats(frame: any, pilot: PilotInfo, bonuses: Bonus[]): MechStats {
  const f = frame?.stats ?? {};
  const { hull, agi, sys, eng } = pilot.hase;
  const grit = pilot.grit;
  const stats: MechStats = {
    size: num(f.size, 1),
    hp: num(f.hp) + grit + 2 * hull,
    armor: num(f.armor),
    structure: num(f.structure, 4),
    stress: num(f.stress, 4),
    heatcap: num(f.heatcap) + eng,
    evasion: num(f.evasion) + agi,
    edef: num(f.edef) + sys,
    speed: num(f.speed) + Math.floor(agi / 2),
    sensor: num(f.sensor_range),
    techAttack: num(f.tech_attack) + sys,
    attackBonus: grit,
    save: num(f.save) + grit,
    repcap: num(f.repcap) + Math.floor(hull / 2),
    sp: num(f.sp) + grit + Math.floor(sys / 2),
    limitedBonus: Math.floor(eng / 2),
  };
  for (const b of bonuses) {
    const key = STAT_BONUS_KEYS[b.id];
    const v = evalBonus(b.val, { grit, level: pilot.level });
    if (!key || v === undefined) continue;
    stats[key] = b.replace ? v : stats[key] + v;
  }
  return stats;
}

/** v3 exports store COMP/CON's computed stats; use them when they look populated. */
function applyExportedStats(stats: MechStats, max: any): MechStats {
  if (!max || num(max.hp) <= 0) return stats;
  const pick = (k: string, cur: number) => (max[k] === undefined ? cur : num(max[k], cur));
  return {
    ...stats,
    size: pick("size", stats.size),
    hp: pick("hp", stats.hp),
    armor: pick("armor", stats.armor),
    structure: pick("structure", stats.structure) || stats.structure,
    stress: pick("stress", stats.stress) || stats.stress,
    heatcap: pick("heatcap", stats.heatcap) || stats.heatcap,
    evasion: pick("evasion", stats.evasion) || stats.evasion,
    edef: pick("edef", stats.edef) || stats.edef,
    speed: pick("speed", stats.speed) || stats.speed,
    sensor: pick("sensorRange", stats.sensor) || stats.sensor,
    techAttack: pick("techAttack", stats.techAttack),
    attackBonus: pick("attackBonus", stats.attackBonus),
    save: pick("saveTarget", stats.save) || stats.save,
    repcap: pick("repairCapacity", stats.repcap) || stats.repcap,
    limitedBonus: pick("limitedBonus", stats.limitedBonus),
  };
}

function initialState(m: any, stats: MechStats): Partial<CombatantState> {
  const full: Partial<CombatantState> = {
    hp: stats.hp,
    structure: stats.structure,
    stress: stats.stress,
    heat: 0,
    burn: 0,
    os: 0,
    repairs: stats.repcap,
    core: true,
  };
  // v3: stats.current (only trust it if COMP/CON had computed max stats)
  const cur = m.stats?.current;
  if (cur && num(m.stats?.max?.hp) > 0) {
    return {
      hp: num(cur.hp, stats.hp),
      structure: num(cur.structure, stats.structure),
      stress: num(cur.stress, stats.stress),
      heat: num(cur.heat, 0),
      burn: num(cur.burn, 0),
      os: num(cur.overshield, 0),
      repairs: num(cur.repairCapacity, stats.repcap),
      core: m.corePower !== false,
    };
  }
  // v2: current_* fields on the mech
  if (m.current_hp !== undefined) {
    return {
      hp: num(m.current_hp, stats.hp),
      structure: num(m.current_structure, stats.structure),
      stress: num(m.current_stress, stats.stress),
      heat: num(m.current_heat, 0),
      burn: num(m.burn, 0),
      os: num(m.overshield ?? m.current_overshield, 0),
      repairs: num(m.current_repairs, stats.repcap),
      core: num(m.current_core_energy, 1) > 0,
    };
  }
  return full;
}

export interface ParsedPilot {
  pilotName: string;
  callsign: string;
  mechs: MechSheet[];
  favoriteIndex: number;
}

export function parsePilot(p: any): ParsedPilot {
  const mechs: MechSheet[] = [];
  for (const m of p.mechs ?? []) {
    const warnings: string[] = [];
    const bonuses: Bonus[] = [];
    const pilot = parsePilotInfo(p, warnings, bonuses);

    const frame = m.frameData?.stats ? m.frameData : lookup("frames", m.frame);
    if (!frame) warnings.push(`Frame desconhecido "${m.frame}" (content pack não incluído); os atributos podem estar errados`);
    for (const t of frame?.traits ?? []) collectBonuses(t, bonuses);
    collectBonuses(frame?.core_system, bonuses);

    const lo = Array.isArray(m.loadouts) ? m.loadouts[num(m.active_loadout_index, 0)] ?? m.loadouts[0] : m.loadout;
    const mounts: SheetMount[] = [];
    const mountDefs: [string, any][] = [
      ...((lo?.integratedMounts ?? []).map((x: any) => ["Integrated", { slots: [{ weapon: x.weapon }] }]) as [string, any][]),
      ...((lo?.mounts ?? []).map((x: any) => [x.mount_type ?? "Mount", x]) as [string, any][]),
      ...((lo?.bonus_mounts ?? lo?.extraMounts ?? []).map((x: any) => [x.mount_type ?? "Bonus Mount", x]) as [string, any][]),
      ["Improved Armament", lo?.improved_armament],
      ["Integrated Weapon", lo?.integratedWeapon],
      ["Superheavy Mounting", lo?.superheavy_mounting],
    ];
    for (const [name, def] of mountDefs) {
      const mount = parseMount(name, def, warnings);
      if (mount) mounts.push(mount);
    }
    for (const mount of mounts) for (const w of mount.weapons) {
      const d = lookup("weapons", w.id);
      if (d) collectBonuses(d, bonuses);
    }

    const systems = [
      ...(lo?.integratedSystems ?? []).map((s: any) => parseSystem(s, true, warnings, bonuses)),
      ...(lo?.systems ?? []).map((s: any) => parseSystem(s, false, warnings, bonuses)),
    ].filter(Boolean) as SheetSystem[];

    const stats = applyExportedStats(computeStats(frame, pilot, bonuses), m.stats?.max);

    mechs.push({
      kind: "mech",
      id: uid(),
      version: 1,
      importedAt: Date.now(),
      pilot,
      mech: {
        name: m.name || frame?.name || "Mech",
        frameId: m.frame ?? "",
        frameName: frame?.name ?? prettifyId(m.frame ?? "unknown"),
        manufacturer: manufacturerName(frame?.source),
        mechtype: frame?.mechtype ?? [],
        image: portraitOf(m) ?? (typeof frame?.image_url === "string" ? frame.image_url : undefined),
      },
      stats,
      mounts,
      systems,
      core: parseCore(frame?.core_system),
      traits: (frame?.traits ?? []).map((t: any) => ({ name: t.name, description: toText(t.description) ?? "" })),
      initial: initialState(m, stats),
      warnings: Array.from(new Set(warnings)),
    });
  }
  const favId = p.favorite_mech;
  const favoriteIndex = Math.max(
    0,
    (p.mechs ?? []).findIndex((m: any) => m.id === favId || m.active === true),
  );
  return { pilotName: p.name ?? "", callsign: p.callsign ?? "", mechs, favoriteIndex };
}
