/* eslint-disable @typescript-eslint/no-explicit-any */
// Parses COMP/CON NPC exports (v3 "unit" format and the older v2 format).
// NPC content is not part of the core lancer-data package, so we rely on the
// feature data embedded in v3 exports. v2 NPCs keep their stats but features
// show as names only.
import type { CombatantState, NpcFeatureSheet, NpcFeatureType, NpcSheet, NpcStats } from "../lib/types";
import { lookup, prettifyId, tagName } from "../lib/compendium";
import { tr } from "../lib/i18n";
import { statusesOf } from "../lib/effects";
import { portraitOf } from "../lib/images";
import { num, resolveTierText, tierValue, toText, uid } from "../lib/util";

const FEATURE_TYPES: NpcFeatureType[] = ["weapon", "tech", "system", "trait", "reaction"];

function parseFeature(entry: any, tier: number, warnings: string[]): NpcFeatureSheet {
  const id = entry?.id ?? entry?.itemID ?? entry?.data?.id ?? "feature";
  // v3 exports embed the data; v2 exports only have the ID, resolved from imported content packs.
  const d = entry?.data && typeof entry.data === "object" ? entry.data : lookup("npcFeatures", id) ?? null;
  if (!d) {
    warnings.push(
      `Habilidade "${id}" não está no arquivo (exportação antiga do COMP/CON) nem num content pack importado; só o nome é exibido`,
    );
    return {
      uid: uid(),
      id,
      name: entry?.flavorName || prettifyId(id),
      type: "trait",
      tags: [],
      damage: [],
      range: [],
      attackBonus: 0,
      accuracy: 0,
      isMelee: false,
      actions: [],
    };
  }
  const rawType = String(d.type ?? "trait").toLowerCase();
  const type = (FEATURE_TYPES.includes(rawType as NpcFeatureType) ? rawType : "trait") as NpcFeatureType;
  const text = (v: any) => resolveTierText(toText(v), tier);
  const weaponType = d.weapon_type ? String(d.weapon_type) : undefined;
  return {
    uid: uid(),
    id,
    name: entry?.flavorName ? `${entry.flavorName} (${d.name})` : d.name ?? prettifyId(id),
    type,
    origin: d.origin,
    // Some features (mostly v3 data) have no `effect` text, only active effects and actions.
    effect: text(d.effect) ?? (d.actions?.length ? undefined : text(d.active_effects)),
    trigger: text(d.trigger),
    tags: (Array.isArray(d.tags) ? d.tags : []).map((t: any) => {
      const val = tierValue<string | number>(t.val, tier);
      return { id: t.id, name: tagName(t.id, val), val };
    }),
    weaponType,
    damage: (Array.isArray(d.damage) ? d.damage : []).map((x: any) => ({
      type: x.type ?? "Kinetic",
      val: String(tierValue(x.val ?? x.damage, tier) ?? 0),
    })),
    range: (Array.isArray(d.range) ? d.range : []).map((r: any) => ({
      type: r.type ?? "Range",
      val: String(tierValue(r.val, tier) ?? ""),
    })),
    attackBonus: num(tierValue(d.attack_bonus, tier), 0),
    accuracy: num(tierValue(d.accuracy, tier), 0),
    onHit: text(d.on_hit),
    onCrit: text(d.on_crit),
    hitStatuses: statusesOf(d.on_hit),
    critStatuses: statusesOf(d.on_crit),
    onAttack: text(d.on_attack),
    isMelee: /melee/i.test(weaponType ?? ""),
    attacks: tierValue<number>(d.attacks, tier),
    actions: [
      ...(Array.isArray(d.actions) ? d.actions : []).map((a: any) => ({
        name: a.name ?? d.name,
        activation: a.activation,
        trigger: text(a.trigger),
        detail: text(a.detail),
        frequency: a.frequency,
        statuses: statusesOf(a),
      })),
      // Features that declare their activation on the feature itself (e.g. a Full action system)
      ...(!d.actions?.length && d.activation && type !== "weapon"
        ? [{ name: d.name, activation: d.activation, detail: undefined, trigger: undefined, frequency: undefined }]
        : []),
      ...(Array.isArray(d.deployables) ? d.deployables : []).map((x: any) => {
        const stats = [
          x.size !== undefined ? `Size ${x.size}` : "",
          x.hp !== undefined ? `HP ${tierValue(x.hp, tier)}` : "",
          x.evasion !== undefined ? `Evasion ${tierValue(x.evasion, tier)}` : "",
          x.edef !== undefined ? `E-Def ${tierValue(x.edef, tier)}` : "",
          x.armor !== undefined ? `Armor ${tierValue(x.armor, tier)}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return {
          name: `${x.name ?? "Implantável"}${x.type ? ` (${tr(x.type)})` : ""}`,
          activation: x.activation ? `Implantar: ${tr(x.activation)}` : "Implantável",
          detail: [stats, text(x.detail)].filter(Boolean).join("<br>"),
        };
      }),
    ],
  };
}

function statsFromClass(classStats: any, tier: number): NpcStats {
  const t = (k: string, fb = 0) => num(tierValue(classStats?.[k], tier), fb);
  return {
    size: t("size", 1),
    hp: t("hp", 10),
    armor: t("armor"),
    structure: t("structure", 1),
    stress: t("stress", 1),
    heatcap: t("heatcap"),
    evasion: t("evade", t("evasion")),
    edef: t("edef"),
    speed: t("speed"),
    sensor: t("sensor"),
    save: t("save"),
    hull: t("hull"),
    agi: t("agility"),
    sys: t("systems"),
    eng: t("engineering"),
    activations: t("activations", 1),
    techAttack: t("systems"),
  };
}

function statsFromV3Max(max: any, fb: NpcStats): NpcStats {
  const p = (k: string, cur: number) => (max?.[k] === undefined ? cur : num(Array.isArray(max[k]) ? max[k][0] : max[k], cur));
  return {
    size: p("size", fb.size),
    hp: p("hp", fb.hp),
    armor: p("armor", fb.armor),
    structure: p("structure", fb.structure) || 1,
    stress: p("stress", fb.stress) || 1,
    heatcap: p("heatcap", fb.heatcap),
    evasion: p("evasion", fb.evasion),
    edef: p("edef", fb.edef),
    speed: p("speed", fb.speed),
    sensor: p("sensorRange", fb.sensor),
    save: p("saveTarget", fb.save),
    hull: p("hull", fb.hull),
    agi: p("agi", fb.agi),
    sys: p("sys", fb.sys),
    eng: p("eng", fb.eng),
    activations: p("activations", fb.activations) || 1,
    techAttack: max?.techAttack ? num(max.techAttack) : p("sys", fb.sys),
  };
}

export interface ParsedNpc {
  sheet: NpcSheet;
  initial: Partial<CombatantState>;
}

export function isNpcData(d: any): boolean {
  return !!d && (d.npcType === "unit" || (d.class !== undefined && d.tier !== undefined && !d.mechs));
}

export function parseNpc(d: any): ParsedNpc {
  const warnings: string[] = [];
  const tier = Math.min(Math.max(num(d.tier, 1), 1), 3);
  const isV3 = typeof d.class === "object" && d.class !== null;
  const classData = isV3 ? d.class.data ?? lookup("npcClasses", d.class.id) ?? {} : lookup("npcClasses", String(d.class)) ?? {};
  const className = classData.name ?? prettifyId(String(isV3 ? d.class.id ?? "" : d.class ?? "npc"));

  let stats: NpcStats;
  let initial: Partial<CombatantState> = {};
  if (isV3) {
    const base = statsFromClass(classData.stats, tier);
    const cs = d.combat_data?.stats;
    const hasMax = cs?.max && num(cs.max.hp) > 0;
    stats = hasMax ? statsFromV3Max(cs.max, base) : base;
    if (hasMax && cs.current) {
      initial = {
        hp: num(cs.current.hp, stats.hp),
        structure: num(cs.current.structure, stats.structure),
        stress: num(cs.current.stress, stats.stress),
        heat: num(cs.current.heat, 0),
        burn: num(cs.current.burn, 0),
        os: num(cs.current.overshield, 0),
      };
    }
  } else {
    // v2: stats are already resolved for the tier; apply the file's explicit bonuses / overrides
    const raw = d.stats ?? {};
    const s: any = { ...raw };
    for (const [k, v] of Object.entries(raw.bonuses ?? {})) if (typeof v === "number" && typeof s[k] === "number") s[k] += v;
    for (const [k, v] of Object.entries(raw.overrides ?? {})) if (typeof v === "number" && v !== 0) s[k] = v;
    stats = {
      size: num(s.size, 1),
      hp: num(s.hp, 10),
      armor: num(s.armor),
      structure: num(s.structure, 1),
      stress: num(s.stress, 1),
      heatcap: num(s.heatcap),
      evasion: num(s.evade ?? s.evasion),
      edef: num(s.edef),
      speed: num(s.speed),
      sensor: num(s.sensor),
      save: num(s.save),
      hull: num(s.hull),
      agi: num(s.agility),
      sys: num(s.systems),
      eng: num(s.engineering),
      activations: num(s.activations, 1),
      techAttack: num(s.systems),
    };
    const c = d.currentStats;
    if (c) {
      initial = {
        hp: num(c.hp, stats.hp),
        structure: num(c.structure, stats.structure),
        stress: num(c.stress, stats.stress),
        burn: num(d.burn, 0),
        os: num(d.overshield, 0),
      };
    }
  }

  const rawFeatures = isV3 ? d.features ?? [] : d.items ?? [];
  // v2 items can override the tier per feature
  const features = rawFeatures.map((f: any) => parseFeature(f, isV3 ? tier : num(f?.tier, tier), warnings));
  const templates = (d.templates ?? []).map((t: any) => {
    const id = typeof t === "string" ? t : t?.id;
    return (typeof t === "object" && t?.data?.name) || lookup("npcTemplates", id)?.name || prettifyId(id ?? "template");
  });

  const sheet: NpcSheet = {
    kind: "npc",
    id: uid(),
    version: 1,
    importedAt: Date.now(),
    name: d.name || className,
    className,
    role: classData.role ?? d.role ?? "",
    tier,
    tag: d.tag ?? "Mech",
    templates,
    stats,
    features,
    description: toText(d.description),
    image: portraitOf(d),
    warnings: Array.from(new Set(warnings)),
    raw: warnings.length ? d : undefined,
  };
  return { sheet, initial };
}
