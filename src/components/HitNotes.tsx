import type { CombatantState, HitNote } from "../lib/types";
import { durationText } from "../lib/hitNotes";
import { patchCombatant } from "../obr/room";
import { Html } from "./Html";
import { Section } from "./common";
import { useApp } from "./AppContext";

/**
 * Lasting effects this character got from hits ("until the start of its next turn..."): what the
 * ability does and until when. They go away on their own; the ×, or switching whose turn ends it,
 * fix a wrong guess from the text.
 */
export function HitNotes({ c, editable }: { c?: CombatantState; editable: boolean }) {
  const app = useApp();
  const notes = c?.nts ?? [];
  if (!c || !notes.length) return null;
  const save = (next: HitNote[]) => void patchCombatant(c.id, { nts: next.length ? next : undefined });
  const remove = (id: string) => save(notes.filter((n) => n.id !== id));
  // the turn that ends it: the attacker's or this character's
  const swap = (n: HitNote) =>
    save(notes.map((x) => (x.id === n.id ? { ...x, who: x.who === c.id ? x.srcId : c.id, started: undefined } : x)));
  return (
    <Section title={`Efeitos sofridos (${notes.length})`}>
      {notes.map((n) => (
        <div key={n.id} className="card hit-note">
          <div className="card-head">
            <div>
              <strong>{n.what}</strong>
              <div className="muted small">
                de {n.src} · <b>{durationText(n, app.room.combatants)}</b>
              </div>
            </div>
            {editable && (
              <div className="row gap">
                {(n.until === "start" || n.until === "end") && n.srcId && n.srcId !== c.id && (
                  <button
                    className="btn-small ghost"
                    title="Trocar de quem é o turno que encerra o efeito (atacante ou este personagem)"
                    onClick={() => swap(n)}
                  >
                    ⇄ Turno
                  </button>
                )}
                <button className="icon-btn" onClick={() => remove(n.id)} aria-label="Remover efeito" title="Remover efeito">
                  ×
                </button>
              </div>
            )}
          </div>
          <Html html={n.html} />
        </div>
      ))}
    </Section>
  );
}
