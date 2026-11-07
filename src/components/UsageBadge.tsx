import type { CombatantState, TagEntry } from "../lib/types";
import { patchCombatant } from "../obr/room";

/**
 * Limited X uses left and whether a Loading weapon is loaded. Both are marked when the weapon
 * attacks; clicking fixes them by hand (gives back one use / reloads).
 */
export function UsageBadge({ c, tags, uid, editable }: { c?: CombatantState; tags: TagEntry[]; uid: string; editable: boolean }) {
  const max = Number(tags.find((t) => t.id === "tg_limited")?.val);
  const loading = tags.some((t) => t.id === "tg_loading");
  if (!c || (!(max > 0) && !loading)) return null;
  const used = c.lu?.[uid] ?? 0;
  const unloaded = loading && !!c.ul?.includes(uid);
  const restore = () => {
    if (used <= 0) return;
    const lu = { ...(c.lu ?? {}), [uid]: used - 1 };
    if (!lu[uid]) delete lu[uid];
    void patchCombatant(c.id, { lu: Object.keys(lu).length ? lu : undefined });
  };
  const reload = () => {
    const ul = (c.ul ?? []).filter((x) => x !== uid);
    void patchCombatant(c.id, { ul: ul.length ? ul : undefined });
  };
  return (
    <div className="row gap wrap">
      {max > 0 && (
        <button
          className={`badge badge-btn ${used >= max ? "badge-off" : ""}`}
          disabled={!editable || used <= 0}
          title="Limitado: os usos só voltam com um Reparo Total (clique para devolver um uso)"
          onClick={restore}
        >
          Usos {Math.max(0, max - used)}/{max}
        </button>
      )}
      {loading && (
        <button
          className={`badge badge-btn ${unloaded ? "badge-off" : ""}`}
          disabled={!editable || !unloaded}
          title={unloaded ? "Descarregada: Estabilizar recarrega (clique para recarregar)" : "Carregada"}
          onClick={reload}
        >
          {unloaded ? "Descarregada" : "Carregada"}
        </button>
      )}
    </div>
  );
}
