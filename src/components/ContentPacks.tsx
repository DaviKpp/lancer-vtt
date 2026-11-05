import { useRef, useState, useSyncExternalStore } from "react";
import { lcpStore } from "../lib/lcp";
import { templateStore } from "../obr/templates";
import { Section } from "./common";
import { notify } from "../obr/toast";

const PACK_LABEL: Record<string, string> = {
  npc_classes: "classes de NPC",
  npc_features: "habilidades de NPC",
  npc_templates: "templates de NPC",
  frames: "frames",
  weapons: "armas",
  systems: "sistemas",
  mods: "mods",
  talents: "talentos",
  core_bonuses: "bônus de núcleo",
  tags: "tags",
  pilot_gear: "equipamentos de piloto",
  manufacturers: "fabricantes",
};

/** Re-parses templates that had unresolved items, using the content packs now available. */
async function reparseTemplates(): Promise<number> {
  const { parseCompcon } = await import("../parsers");
  const updated = [];
  for (const t of templateStore.list()) {
    if (!t.raw) continue;
    const parsed = parseCompcon(t.raw).npcs[0]?.sheet;
    if (parsed) updated.push({ ...parsed, id: t.id, name: t.name });
  }
  if (updated.length) templateStore.replace(updated);
  return updated.length;
}

export function ContentPacks() {
  const packs = useSyncExternalStore(
    (fn) => lcpStore.subscribe(fn),
    () => lcpStore.list(),
  );
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const f of Array.from(files)) {
        const pack = await lcpStore.importFile(f);
        const n = Object.values(pack.counts).reduce((a, b) => a + (b ?? 0), 0);
        await notify(`${pack.name} carregado (${n} itens).`, "SUCCESS");
      }
      const fixed = await reparseTemplates();
      if (fixed) await notify(`${fixed} template(s) atualizado(s) com os novos dados.`, "SUCCESS");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Section title={`Content packs (${packs.length})`} defaultOpen={packs.length === 0}>
      <p className="muted small">
        Exportações antigas do COMP/CON (v2) só trazem os IDs das habilidades de NPC. Importe os mesmos arquivos{" "}
        <b>.lcp</b> que você carregou no COMP/CON (ex.: <i>LANCER Core NPCs</i>, Long Rim, Wallflower) e esses IDs viram
        fichas completas. Os packs ficam salvos neste navegador.
      </p>
      <input ref={input} type="file" accept=".lcp,.zip" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <button className="btn-small" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Lendo…" : "Importar content pack (.lcp)"}
      </button>
      {error && <div className="error">{error}</div>}
      {packs.map((p) => (
        <div key={p.id} className="row between">
          <span>
            <strong>{p.name}</strong> <span className="muted small">{p.version}</span>
            <div className="muted small">
              {Object.entries(p.counts)
                .map(([k, v]) => `${v} ${PACK_LABEL[k] ?? k.replace(/_/g, " ")}`)
                .join(" · ")}
            </div>
          </span>
          <button className="btn-small ghost danger" onClick={() => lcpStore.remove(p.id)}>
            Remover
          </button>
        </div>
      ))}
    </Section>
  );
}
