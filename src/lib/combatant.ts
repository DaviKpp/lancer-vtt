import type { CombatantState, MechSheet, NpcSheet } from "./types";

export function combatantFromMech(
  sheet: MechSheet,
  owner: string,
  ownerName: string,
  initial: Partial<CombatantState> = sheet.initial,
): CombatantState {
  const s = sheet.stats;
  return {
    id: sheet.id,
    kind: "mech",
    owner,
    ownerName,
    name: sheet.pilot.callsign ? `${sheet.mech.name} (${sheet.pilot.callsign})` : sheet.mech.name,
    sub: `${sheet.mech.manufacturer ? sheet.mech.manufacturer + " " : ""}${sheet.mech.frameName} · NL${sheet.pilot.level}`,
    hp: initial.hp ?? s.hp,
    maxHp: s.hp,
    os: initial.os ?? 0,
    heat: initial.heat ?? 0,
    heatcap: s.heatcap,
    structure: initial.structure ?? s.structure,
    maxStructure: s.structure,
    stress: initial.stress ?? s.stress,
    maxStress: s.stress,
    burn: initial.burn ?? 0,
    armor: s.armor,
    evasion: s.evasion,
    edef: s.edef,
    core: initial.core ?? true,
    repairs: initial.repairs ?? s.repcap,
    maxRepairs: s.repcap,
    activations: 1,
    used: 0,
    // Gorgon frame trait: can take 2 reactions per turn
    ...(/gorgon/i.test(sheet.mech.frameId) ? { rpt: 2 } : {}),
  };
}

export function combatantFromNpc(
  sheet: NpcSheet,
  owner: string,
  ownerName: string,
  initial: Partial<CombatantState> = {},
): CombatantState {
  const s = sheet.stats;
  return {
    id: sheet.id,
    kind: "npc",
    owner,
    ownerName,
    name: sheet.name,
    sub: `${sheet.className} · T${sheet.tier}${sheet.templates.length ? " · " + sheet.templates.join(", ") : ""}`,
    hp: initial.hp ?? s.hp,
    maxHp: s.hp,
    os: initial.os ?? 0,
    heat: initial.heat ?? 0,
    heatcap: s.heatcap,
    structure: initial.structure ?? s.structure,
    maxStructure: s.structure,
    stress: initial.stress ?? s.stress,
    maxStress: s.stress,
    burn: initial.burn ?? 0,
    armor: s.armor,
    evasion: s.evasion,
    edef: s.edef,
    core: false,
    repairs: 0,
    maxRepairs: 0,
    activations: s.activations,
    used: 0,
  };
}

/** Who may see the full card/sheet of a combatant. */
export function canView(c: CombatantState, me: { role: "GM" | "PLAYER"; playerId: string }) {
  return me.role === "GM" || c.owner === me.playerId;
}
