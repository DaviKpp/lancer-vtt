// Shared data model for the extension.
//
// Two kinds of data exist:
//  - Sheets: the static, parsed content of a COMP/CON export (names, effects, weapons...).
//    They can be several KB each, so they live in the uploader's browser (localStorage)
//    and are shared with the GM over OBR broadcast.
//  - Combatant state: small, frequently-changing numbers (HP, heat, structure...) and the
//    token link. This lives in room metadata so every client sees updates live.

export type DamageEntry = { type: string; val: string };
export type RangeEntry = { type: string; val: string };
export type TagEntry = { id: string; name: string; val?: string | number };

/** A status/condition an effect imposes; `save` = the target may avoid it with this save. */
export interface StatusEffect {
  id: string;
  save?: string;
}

export type ActionEntry = {
  name: string;
  activation?: string;
  trigger?: string;
  detail?: string;
  frequency?: string;
  statuses?: StatusEffect[]; // imposed on the target
};

export interface SheetWeapon {
  uid: string;
  id: string;
  name: string;
  mount: string; // weapon size: Aux/Main/Heavy/Superheavy
  type: string; // Rifle, CQB, Melee...
  damage: DamageEntry[];
  range: RangeEntry[];
  tags: TagEntry[];
  effect?: string;
  onAttack?: string;
  onHit?: string;
  onCrit?: string;
  hitStatuses?: StatusEffect[];
  critStatuses?: StatusEffect[];
  sp?: number;
  mod?: { name: string; effect?: string };
  accuracy: number; // from tags (accurate / inaccurate) and mount bonuses
  destroyed?: boolean;
  actions?: ActionEntry[];
  isMelee: boolean;
}

export interface SheetMount {
  name: string; // "Main", "Flex", "Integrated", "Improved Armament"...
  weapons: SheetWeapon[];
  bonuses: string[]; // core-bonus names applied to this mount
}

export interface SheetSystem {
  uid: string;
  id: string;
  name: string;
  type?: string;
  sp?: number;
  effect?: string;
  tags: TagEntry[];
  actions: ActionEntry[];
  integrated?: boolean;
  destroyed?: boolean;
  isTech: boolean; // has a tech action (invade/quick tech/full tech)
}

export interface CoreSystemInfo {
  name: string;
  description?: string;
  passiveName?: string;
  passiveEffect?: string;
  activeName: string;
  activeEffect: string;
  activation?: string;
  use?: string;
}

export interface PilotInfo {
  name: string;
  image?: string; // portrait URL from COMP/CON
  callsign: string;
  playerName: string;
  level: number;
  grit: number;
  background: string;
  hase: { hull: number; agi: number; sys: number; eng: number };
  hp: number;
  armor: number;
  evasion: number;
  edef: number;
  speed: number;
  skills: { name: string; rank: number; description?: string }[];
  talents: { name: string; rank: number; ranks: { name: string; description: string; actions?: ActionEntry[] }[] }[];
  coreBonuses: { name: string; effect: string }[];
  licenses: { name: string; rank: number }[];
  gear: string[];
  /** Pilot weapons from the loadout (used on foot, after dismounting). */
  weapons?: SheetWeapon[];
}

export interface MechStats {
  size: number;
  hp: number;
  armor: number;
  structure: number;
  stress: number;
  heatcap: number;
  evasion: number;
  edef: number;
  speed: number;
  sensor: number;
  techAttack: number;
  attackBonus: number;
  save: number;
  repcap: number;
  sp: number;
  limitedBonus: number;
}

export interface MechSheet {
  kind: "mech";
  id: string;
  version: 1;
  importedAt: number;
  pilot: PilotInfo;
  mech: {
    name: string;
    frameId: string;
    frameName: string;
    manufacturer: string;
    mechtype: string[];
    image?: string; // mech portrait from COMP/CON, or the frame's default art
  };
  stats: MechStats;
  mounts: SheetMount[];
  systems: SheetSystem[];
  core: CoreSystemInfo | null;
  traits: { name: string; description: string }[];
  initial: Partial<CombatantState>;
  warnings: string[];
}

export type NpcFeatureType = "weapon" | "tech" | "system" | "trait" | "reaction";

export interface NpcFeatureSheet {
  uid: string;
  id: string;
  name: string;
  type: NpcFeatureType;
  origin?: string;
  effect?: string;
  trigger?: string;
  tags: TagEntry[];
  weaponType?: string;
  damage: DamageEntry[];
  range: RangeEntry[];
  attackBonus: number;
  accuracy: number;
  onHit?: string;
  onCrit?: string;
  onAttack?: string;
  hitStatuses?: StatusEffect[];
  critStatuses?: StatusEffect[];
  isMelee: boolean;
  actions: ActionEntry[];
  destroyed?: boolean;
  attacks?: number; // number of attacks per use (some weapons attack several times)
}

export interface NpcStats {
  size: number;
  hp: number;
  armor: number;
  structure: number;
  stress: number;
  heatcap: number;
  evasion: number;
  edef: number;
  speed: number;
  sensor: number;
  save: number;
  hull: number;
  agi: number;
  sys: number;
  eng: number;
  activations: number;
  techAttack: number;
}

export interface NpcSheet {
  kind: "npc";
  id: string;
  version: 1;
  importedAt: number;
  name: string;
  className: string;
  role: string;
  tier: number;
  tag: string;
  templates: string[];
  stats: NpcStats;
  features: NpcFeatureSheet[];
  description?: string;
  warnings: string[];
  image?: string; // NPC portrait from COMP/CON
  /** Original COMP/CON data, kept when something couldn't be resolved so it can be re-parsed after a content pack is imported. */
  raw?: unknown;
}

export type Sheet = MechSheet | NpcSheet;

/** Live state, stored per combatant in room metadata. Keep keys short: room metadata is limited to 16kB. */
export interface CombatantState {
  id: string;
  /** "pilot": a lancer's pilot outside of the mech (created when dismounting). */
  kind: "mech" | "npc" | "pilot";
  owner: string; // OBR player id of the owner (GM for NPCs)
  ownerName: string;
  name: string;
  sub: string; // frame name / npc class + tier
  tokenId?: string;
  hp: number;
  maxHp: number;
  os: number; // overshield
  heat: number;
  heatcap: number;
  structure: number;
  maxStructure: number;
  stress: number;
  maxStress: number;
  burn: number;
  armor: number;
  evasion: number;
  edef: number;
  core: boolean; // core power available (mechs)
  repairs: number;
  maxRepairs: number;
  activations: number;
  used: number; // activations used this round
  tpl?: string; // NPC template id this instance was spawned from
  ac?: TurnActions; // actions spent this turn
  ocn?: number; // overcharges used this scene (heat cost escalates)
  rx?: { tk: number; n: number }; // reactions used during turn `tk` of the encounter
  ru?: Record<string, number>; // uses of each reaction since the start of this character's turn
  br?: 1 | 2; // Brace: 1 = braced, waiting for next turn; 2 = in the restricted turn after bracing
  rpt?: number; // reactions allowed per turn (Gorgon: 2)
  dx?: string[]; // uids of destroyed weapons / systems / NPC features (structure damage)
  im?: string; // portrait URL (http only, so it fits in room metadata) shown to everyone
  st?: string[]; // active statuses / conditions (lancer-data status ids)
  dm?: 1; // mech: the pilot dismounted (the mech is empty)
  php?: number; // mech: the pilot's HP, kept while mounted
  pm?: string; // pilot: id of the mech this pilot belongs to
}

/** Actions spent in the current turn. Short keys: room metadata is size-limited. */
export interface TurnActions {
  q?: number; // quick actions used
  f?: boolean; // full action used
  m?: boolean; // standard move used
  o?: boolean; // overcharged this turn
}

export interface EncounterState {
  id: string;
  name: string;
  status: "setup" | "active";
  round: number;
  combatants: string[];
  actor?: string; // whose turn it is
  tk?: number; // turn counter (increments whenever a turn starts or ends)
}

export interface RollPart {
  label: string;
  value: string;
}

export interface RollResult {
  id: string;
  ts: number;
  by: string; // player name
  byId: string;
  attackerId: string;
  attackerName: string;
  targetId?: string;
  targetName?: string;
  kind: "attack" | "tech" | "damage" | "check" | "action" | "skill";
  label: string; // weapon / action name
  d20: number;
  accDice: number[]; // the d6 accuracy/difficulty dice
  netAccuracy: number;
  bonus: number;
  total: number;
  defense?: number; // evasion or edef of the target
  defenseLabel?: "Eva" | "Def-E"; // which one (Smart weapons attack E-Defense)
  ap?: boolean; // the weapon is armor-piercing (AP tag)
  outcome?: "hit" | "miss" | "crit";
  damage?: { type: string; amount: number; detail: string }[];
  notes?: string[];
  /** What the attack does on a hit (shown on the card). */
  effect?: string;
  /** Statuses/conditions that still need a decision (save, target's choice...). */
  pending?: StatusEffect[];
  /** Effects applied automatically to the target on the hit. */
  applied?: string[];
  /** Structure check "System Trauma": what has to be destroyed. */
  trauma?: "mount" | "system";
}
