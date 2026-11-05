// Pilots outside their mech: a separate combatant (own HP, armor, defenses, token) linked to the mech.
import type { CombatantState, PilotInfo } from "./types";
import { shareableImage } from "./images";

export const pilotIdFor = (mechId: string) => `${mechId}~p`;

/** The pilot combatant created when dismounting (HP carried over from the last time it was out). */
export function pilotCombatant(mech: CombatantState, p: PilotInfo): CombatantState {
  const maxHp = Math.max(1, p.hp);
  const hp = Math.max(0, Math.min(maxHp, mech.php ?? maxHp));
  return {
    id: pilotIdFor(mech.id),
    kind: "pilot",
    pm: mech.id,
    owner: mech.owner,
    ownerName: mech.ownerName,
    name: p.callsign || p.name || `Piloto de ${mech.name}`,
    sub: `Piloto de ${mech.name}`,
    hp,
    maxHp,
    os: 0,
    heat: 0,
    heatcap: 0,
    // a pilot has no structure: 1 point that is lost at 0 HP (down and out)
    structure: hp > 0 ? 1 : 0,
    maxStructure: 1,
    stress: 0,
    maxStress: 0,
    burn: 0,
    armor: p.armor,
    evasion: p.evasion,
    edef: p.edef,
    core: false,
    repairs: 0,
    maxRepairs: 0,
    activations: 0, // acts in the mech's turn, not in the initiative
    used: 0,
    im: shareableImage(p.image),
  };
}
