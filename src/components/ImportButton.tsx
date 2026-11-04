import { useRef, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { ParsedNpc, ParsedPilot } from "../parsers";
import { combatantFromMech } from "../lib/combatant";
import { templateStore } from "../obr/templates";
import type { CombatantState, Sheet } from "../lib/types";
import { putCombatant } from "../obr/room";
import { sheetStore } from "../obr/sheets";
import { useApp } from "./AppContext";

export async function addToRoom(sheet: Sheet, state: CombatantState) {
  // Room entry first so other clients accept the sheet when it arrives.
  await putCombatant(state);
  await sheetStore.add(sheet);
}

interface Pending {
  pilots: ParsedPilot[];
  npcs: ParsedNpc[];
  selected: Set<string>;
}

export function ImportButton({ mode }: { mode: "mech" | "npc" }) {
  const app = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [owner, setOwner] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const pilots: ParsedPilot[] = [];
    const npcs: ParsedNpc[] = [];
    const errs: string[] = [];
    // Loaded on demand: the parsers pull in the LANCER compendium (~700KB of JSON).
    const { parseCompcon, readJsonFile } = await import("../parsers");
    for (const file of Array.from(files)) {
      try {
        const r = parseCompcon(await readJsonFile(file));
        pilots.push(...r.pilots);
        npcs.push(...r.npcs);
        errs.push(...r.errors.map((e) => `${file.name}: ${e}`));
      } catch (e) {
        errs.push(`${file.name}: JSON inválido (${(e as Error).message})`);
      }
    }
    if (input.current) input.current.value = "";
    if (mode === "mech" && npcs.length)
      errs.push(app.isGM ? "Arquivos de NPC vão na aba Templates." : "Só o mestre pode importar arquivos de NPC.");
    // NPCs only go to the GM's template library (NPC tab); pilots only from the mech tab.
    const usableNpcs = app.isGM && mode === "npc" ? npcs : [];
    if (mode === "npc" && pilots.length) errs.push("Arquivos de piloto vão na aba Lancers.");
    if (mode === "npc") pilots.length = 0;
    const selected = new Set<string>();
    pilots.forEach((p) => p.mechs[p.favoriteIndex] && selected.add(p.mechs[p.favoriteIndex].id));
    usableNpcs.forEach((n) => selected.add(n.sheet.id));
    setErrors(errs);
    if (pilots.some((p) => p.mechs.length) || usableNpcs.length) {
      setOwner(app.session.playerId);
      setPending({ pilots, npcs: usableNpcs, selected });
    } else if (!errs.length) setErrors(["Nenhum mech ou NPC encontrado nesse arquivo."]);
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const ownerName =
        owner === app.session.playerId ? app.session.playerName : app.party.find((p) => p.id === owner)?.name ?? "Jogador";
      let count = 0;
      for (const p of pending.pilots) {
        for (const m of p.mechs) {
          if (!pending.selected.has(m.id)) continue;
          await addToRoom(m, combatantFromMech(m, owner, ownerName));
          count++;
        }
      }
      const templates = pending.npcs.filter((n) => pending.selected.has(n.sheet.id)).map((n) => n.sheet);
      if (templates.length) templateStore.add(templates);
      count += templates.length;
      await OBR.notification.show(
        templates.length && count === templates.length
          ? `${count} template${count === 1 ? "" : "s"} de NPC salvo${count === 1 ? "" : "s"}.`
          : `${count} ${count === 1 ? "item importado" : "itens importados"}.`,
        "SUCCESS",
      );
      setPending(null);
    } catch (e) {
      setErrors([`Falha na importação: ${(e as Error).message}`]);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setPending((p) => {
      if (!p) return p;
      const selected = new Set(p.selected);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...p, selected };
    });

  const others = app.party.filter((p) => p.id !== app.session.playerId);

  return (
    <div className="import">
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      <button className="btn-primary wide" onClick={() => input.current?.click()}>
        {mode === "mech" ? "Importar piloto do COMP/CON (.json)" : "Importar templates de NPC do COMP/CON (.json)"}
      </button>
      {errors.length > 0 && (
        <div className="error">
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}
      {pending && (
        <div className="import-dialog">
          {pending.pilots.map((p, pi) => (
            <div key={pi}>
              <div className="mount-head">
                Piloto: {p.callsign || p.pilotName} — escolha o{p.mechs.length > 1 ? "s" : ""} mech{p.mechs.length > 1 ? "s" : ""}
              </div>
              {p.mechs.map((m) => (
                <label key={m.id} className="check-row">
                  <input type="checkbox" checked={pending.selected.has(m.id)} onChange={() => toggle(m.id)} />
                  <span>
                    <strong>{m.mech.name}</strong> <span className="muted">{m.mech.frameName}</span>
                    {m.warnings.length ? <span className="warn small"> · {m.warnings.length} nota(s)</span> : null}
                  </span>
                </label>
              ))}
            </div>
          ))}
          {pending.npcs.length > 0 && <div className="mount-head">Templates de NPC</div>}
          {pending.npcs.map((n) => (
            <label key={n.sheet.id} className="check-row">
              <input type="checkbox" checked={pending.selected.has(n.sheet.id)} onChange={() => toggle(n.sheet.id)} />
              <span>
                <strong>{n.sheet.name}</strong>{" "}
                <span className="muted">
                  {n.sheet.className} T{n.sheet.tier}
                </span>
              </span>
            </label>
          ))}
          {app.isGM && pending.pilots.length > 0 && (
            <div className="row gap">
              <span className="small">Dono</span>
              <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value={app.session.playerId}>Eu (Mestre)</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="row gap">
            <button className="btn-primary" disabled={busy || pending.selected.size === 0} onClick={confirm}>
              {mode === "npc" ? `Salvar ${pending.selected.size} template${pending.selected.size === 1 ? "" : "s"}` : `Adicionar ${pending.selected.size} à sala`}
            </button>
            <button className="btn-small ghost" onClick={() => setPending(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
