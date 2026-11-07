// Automatic accuracy / difficulty from the rules (conditions, cover, weapon tags...).
// Positive values are Accuracy, negative values are Difficulty.
import type { CombatantState } from "./types";

export type Cover = "none" | "soft" | "hard";

export const COVER_LABEL: Record<Cover, string> = {
  none: "Sem cobertura",
  soft: "Cobertura leve (+1 Dificuldade)",
  hard: "Cobertura pesada (+2 Dificuldade)",
};

export interface Modifier {
  label: string;
  value: number;
}

export interface AttackShape {
  kind: "attack" | "tech";
  accuracy: number; // from weapon tags (Accurate / Inaccurate) and mount bonuses
  melee?: boolean;
  seeking?: boolean; // ignores cover
  smart?: boolean; // targets E-Defense
  range?: { type: string }[]; // Blast / Burst / Line / Cone make an area attack
  basic?: boolean; // Improvised Attack, Grapple or Ram (the only attacks a Jammed character can make)
}

/** Weapons whose range is an area (Blast, Burst, Line, Cone) affect every character in it. */
export const isAreaAttack = (a: AttackShape) => (a.range ?? []).some((r) => /blast|burst|line|cone/i.test(r.type));

/**
 * Rules that stop an attack outright (LANCER core): a Jammed attacker can only Improvised Attack,
 * Grapple or Ram; a Hidden target can't be targeted directly (only by area attacks); a pilot on foot
 * is immune to tech actions.
 */
export function attackBlockers(a: AttackShape, attacker: CombatantState | undefined, target: CombatantState | undefined) {
  return {
    jammed: has(attacker, "jammed") && !a.basic ? "Você está Bloqueado: só Ataque Improvisado, Agarrar ou Investida" : undefined,
    hidden: has(target, "hidden") && !isAreaAttack(a) ? "Alvo Oculto: só pode ser atingido por ataques em área" : undefined,
    biological:
      (target?.kind === "pilot" || target?.bio) && a.kind === "tech"
        ? `${target?.kind === "pilot" ? "Piloto a pé" : "Alvo"} biológico: imune a ações tech`
        : undefined,
    shutDown:
      has(target, "shut-down") && a.kind === "tech" ? "Alvo Desligado: imune a ações e ataques tech" : undefined,
    bioAttacker: attacker?.bio && a.kind === "tech" ? "NPC biológico: não faz ações tech, salvo se a habilidade disser" : undefined,
  };
}

const has = (c: CombatantState | undefined, id: string) => !!c?.st?.includes(id);

/** Is this a ranged attack (cover and Engaged apply)? Tech attacks are not ranged attacks. */
export function isRanged(a: AttackShape): boolean {
  return a.kind === "attack" && !a.melee;
}

export function autoModifiers(
  a: AttackShape,
  attacker: CombatantState,
  target: CombatantState | undefined,
  cover: Cover,
  consumeLockOn: boolean,
): Modifier[] {
  const mods: Modifier[] = [];
  if (a.accuracy) mods.push({ label: a.accuracy > 0 ? "Arma precisa" : "Arma imprecisa", value: a.accuracy });
  if (has(attacker, "impaired")) mods.push({ label: "Você está Prejudicado", value: -1 });
  if (has(attacker, "engaged") && isRanged(a)) mods.push({ label: "Engajado (ataque à distância)", value: -1 });
  if (target) {
    if (has(target, "prone")) mods.push({ label: "Alvo Caído", value: 1 });
    if (target.br) mods.push({ label: "Alvo Preparado", value: -1 });
    if (has(target, "lockon") && consumeLockOn) mods.push({ label: "Consumir Mira Travada", value: 1 });
    if (isRanged(a) && cover !== "none") {
      if (a.seeking) mods.push({ label: "Teleguiado ignora cobertura", value: 0 });
      else mods.push({ label: cover === "hard" ? "Cobertura pesada" : "Cobertura leve", value: cover === "hard" ? -2 : -1 });
    }
  }
  return mods;
}

/** Defense the attack is rolled against (Smart weapons and tech use E-Defense; Stunned caps Evasion at 5). */
/** The defense an attack rolls against: E-Defense for tech and Smart attacks, Evasion otherwise. */
export function defenseFor(
  a: AttackShape,
  target: CombatantState | undefined,
): { value?: number; label?: "Eva" | "Def-E"; note?: string } {
  if (!target) return {};
  if (a.kind === "tech" || a.smart)
    return { value: target.edef, label: "Def-E", note: a.smart && a.kind === "attack" ? "Inteligente: contra Defesa-E" : undefined };
  if (has(target, "stunned") || has(target, "shut-down"))
    return { value: Math.min(target.evasion, 5), label: "Eva", note: "Alvo Atordoado: Evasão máx. 5" };
  return { value: target.evasion, label: "Eva" };
}

export function netLabel(n: number): string {
  if (n > 0) return `+${n} Precisão`;
  if (n < 0) return `+${-n} Dificuldade`;
  return "sem Precisão/Dificuldade";
}
