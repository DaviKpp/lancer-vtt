// Lasting effects of a hit ("until the start of this character's next turn, the target takes 2 heat
// when it attacks"...). They can't be automated, so the target's sheet keeps a note with the text and
// how long it lasts, and the note goes away on its own when that turn starts or ends.
import type { CombatantState, HitNote } from "./types";

export interface Duration {
  until: HitNote["until"];
  /** Whose turn ends it: the attacker's or the target's. */
  whose?: "attacker" | "target";
  /** "Until the end of the current turn": the turn in progress already counts. */
  current?: boolean;
}

const TARGET_WORDS = /target|alvo|atingid|character hit|hit character/i;
const SELF_WORDS = /this character|the user|attacker|atacante|usu[áa]rio|inimigo|npc|this mech|deste mech|desse mech/i;

/** Plain text of an effect (the data is HTML). */
export function plainText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Plain text of an effect, cut at a word boundary to at most `max` characters. */
export function shortText(html: string, max = 220): string {
  const t = plainText(html);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30))}…`;
}

/** Whose turn a phrase like "its next turn" / "do próximo turno dele" means. */
function ownerOf(owner: string, before: string, attackerIsNpc: boolean): "attacker" | "target" {
  if (TARGET_WORDS.test(owner)) return "target";
  if (SELF_WORDS.test(owner)) return "attacker";
  // "your next turn": a player's weapon talks to the attacker; an NPC feature talks to the player hit
  if (/\byour\b|\bseu\b|\bsua\b|\bvoc[êe]\b/i.test(owner)) return attackerIsNpc ? "target" : "attacker";
  // "its / their / dele": whoever the sentence is about
  const sentence = before.split(/[.!?;]/).pop() ?? "";
  return TARGET_WORDS.test(sentence) ? "target" : "attacker";
}

/** Reads how long an effect lasts from its text. Null when it says nothing about a duration. */
export function parseDuration(html: string, attackerIsNpc: boolean): Duration | null {
  const text = plainText(html);
  if (/until the end of (the )?(scene|encounter|combat)|for the (rest|remainder) of the (scene|encounter)|at[ée] o (fim|final) d[ao] (cena|encontro|combate)|pelo resto d[ao] (cena|encontro|combate)/i.test(text)) {
    return { until: "scene" };
  }
  const en = text.match(/until the (start|beginning|end) of (.{0,40}?)next turn/i);
  if (en) {
    return {
      until: /end/i.test(en[1]) ? "end" : "start",
      whose: ownerOf(en[2], text.slice(0, en.index), attackerIsNpc),
    };
  }
  const pt = text.match(/at[ée] o (in[íi]cio|come[çc]o|fim|final) do (seu |sua )?pr[óo]ximo turno( (de |d[oa]s? |desse |deste |dess[ae] |dest[ae] )?[^.,;:]{0,30})?/i);
  if (pt) {
    return {
      until: /fim|final/i.test(pt[1]) ? "end" : "start",
      whose: ownerOf(`${pt[2] ?? ""}${pt[3] ?? ""}`, text.slice(0, pt.index), attackerIsNpc),
    };
  }
  if (/until the end of (the |this |the current |your |its )?turn|at[ée] o (fim|final) d(o|este|esse) turno/i.test(text)) {
    return { until: "end", whose: "attacker", current: true };
  }
  return null;
}

/** The note a hit leaves on its target, when the effect lasts beyond the attack. */
export function noteFromHit(
  attacker: CombatantState,
  target: CombatantState,
  what: string,
  html: string,
  id: string,
): HitNote | null {
  const d = parseDuration(html, attacker.kind === "npc");
  if (!d) return null;
  return {
    id,
    what,
    src: attacker.name,
    srcId: attacker.id,
    // room storage is tiny (16 kB for the whole room, shared with other extensions): keep only a
    // short plain-text version of the effect
    html: shortText(html),
    until: d.until,
    who: d.whose === "target" ? target.id : d.whose === "attacker" ? attacker.id : undefined,
    started: d.current || undefined,
  };
}

/**
 * Notes that change when `id`'s turn starts or ends: "start" notes on that turn are gone; "end"
 * notes are armed when the turn starts and gone when it ends. Returns only the changed lists.
 */
export function notesOnTurn(
  combatants: Record<string, CombatantState>,
  id: string,
  phase: "start" | "end",
): Record<string, HitNote[] | undefined> {
  const out: Record<string, HitNote[] | undefined> = {};
  for (const c of Object.values(combatants)) {
    if (!c.nts?.length || !c.nts.some((n) => n.who === id)) continue;
    const next = c.nts.flatMap((n): HitNote[] => {
      if (n.who !== id) return [n];
      if (n.until === "start") return phase === "start" ? [] : [n];
      if (n.until === "end") {
        if (phase === "start") return [{ ...n, started: true }];
        return n.started ? [] : [n];
      }
      return [n];
    });
    out[c.id] = next.length ? next : undefined;
  }
  return out;
}

/** Human text for how long a note lasts. */
export function durationText(n: HitNote, combatants: Record<string, CombatantState>): string {
  if (n.until === "scene") return "até o fim da cena";
  if (n.until === "manual" || !n.who) return "até ser removida";
  const name = combatants[n.who]?.name ?? "?";
  if (n.until === "start") return `até o início do próximo turno de ${name}`;
  return n.started ? `até o fim do turno de ${name}` : `até o fim do próximo turno de ${name}`;
}
