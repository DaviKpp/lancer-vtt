import { useEffect, useMemo, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { AppContext, computeTargets, type AppValue } from "./components/AppContext";
import { CombatantList } from "./components/CombatantList";
import { EncounterPanel } from "./components/EncounterPanel";
import { ImportButton } from "./components/ImportButton";
import { MechSheetView } from "./components/MechSheetView";
import { NpcSheetView } from "./components/NpcSheetView";
import { RollLogView } from "./components/RollLogView";
import { TemplateList } from "./components/TemplateList";
import { ActionGuide } from "./components/ActionGuide";
import { canView } from "./lib/combatant";
import type { Sheet } from "./lib/types";
import { applyDestroyed } from "./lib/destroyed";
import { OPEN_CHANNEL } from "./obr/constants";
import { useObrSession, useObrTheme, useParty, useRoomState, useSceneReady, useSheets, useTemplates } from "./obr/hooks";

type Tab = "mechs" | "npcs" | "encounter" | "guide" | "rolls";

export function App() {
  const session = useObrSession();
  const room = useRoomState(session.ready);
  const sheets = useSheets();
  const party = useParty(session.ready);
  const sceneReady = useSceneReady(session.ready);
  const templates = useTemplates();
  useObrTheme(session.ready);

  const isGM = session.role === "GM";
  const [tab, setTab] = useState<Tab>("mechs");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);

  // The token context menu ("Abrir ficha LANCER") asks the popover to show a sheet.
  useEffect(() => {
    if (!session.ready) return;
    try {
      const pending = JSON.parse(localStorage.getItem("lancer-vtt:open") ?? "null") as { id: string; ts: number } | null;
      if (pending && Date.now() - pending.ts < 5000) setOpenId(pending.id);
      localStorage.removeItem("lancer-vtt:open");
    } catch {
      // ignore
    }
    return OBR.broadcast.onMessage(OPEN_CHANNEL, (e) => {
      const id = (e.data as { id?: string })?.id;
      if (id) {
        setOpenTemplateId(null);
        setOpenId(id);
      }
    });
  }, [session.ready]);

  const value: AppValue = useMemo(() => {
    // NPC instances can always be rebuilt from their template if the local copy is missing
    // (another device, cleared storage...).
    const sheetFor = (id: string): Sheet | undefined => {
      const c = room.combatants[id];
      const local = sheets.get(id);
      const tpl = c?.tpl ? templates.find((t) => t.id === c.tpl) : undefined;
      const base = local ?? (tpl && c ? { ...tpl, raw: undefined, id: c.id, name: c.name } : undefined);
      // weapons / systems destroyed in play live in the room state, not in the sheet
      return base ? applyDestroyed(base, c) : undefined;
    };
    return {
      session,
      room,
      sheets,
      sheetFor,
      sceneReady,
      party,
      isGM,
      targetsFor: (attackerId: string) => computeTargets(room, isGM, attackerId),
      openSheet: (id: string | null) => {
        setOpenTemplateId(null);
        setOpenId(id);
      },
    };
  }, [session, room, sheets, templates, sceneReady, party, isGM]);

  if (!session.ready) return <div className="loading">Conectando ao Owlbear Rodeo…</div>;

  const all = Object.values(room.combatants).sort((a, b) => a.name.localeCompare(b.name));
  const mine = all.filter((c) => c.kind === "mech" && (isGM || c.owner === session.playerId));
  const openTemplate = openTemplateId ? templates.find((t) => t.id === openTemplateId) : undefined;

  const open = openId ? room.combatants[openId] : undefined;
  const openSheet = openId ? value.sheetFor(openId) : undefined;
  const allowed = open && canView(open, session);

  const tabs: { id: Tab; label: string }[] = isGM
    ? [
        { id: "mechs", label: `Lancers (${mine.length})` },
        { id: "npcs", label: `Templates (${templates.length})` },
        { id: "encounter", label: "Encontro" },
        { id: "guide", label: "Ações" },
        { id: "rolls", label: "Rolagens" },
      ]
    : [
        { id: "mechs", label: "Meus Mechs" },
        { id: "encounter", label: "Encontro" },
        { id: "guide", label: "Ações" },
        { id: "rolls", label: "Rolagens" },
      ];

  const back = () => {
    setOpenId(null);
    setOpenTemplateId(null);
  };

  return (
    <AppContext.Provider value={value}>
      <div className="app">
        <header className="app-head">
          <span className="logo">LANCER</span>
          <span className="muted small">{isGM ? "Mestre" : session.playerName}</span>
          {room.encounter?.status === "active" && (
            <button className="badge badge-live" onClick={() => (back(), setTab("encounter"))}>
              {room.encounter.name} · R{room.encounter.round}
            </button>
          )}
        </header>

        {openTemplate && isGM ? (
          <div className="sheet-wrap">
            <button className="btn-small ghost back" onClick={back}>
              ← Voltar
            </button>
            <NpcSheetView sheet={openTemplate} editable={false} />
          </div>
        ) : open && allowed ? (
          <div className="sheet-wrap">
            <button className="btn-small ghost back" onClick={back}>
              ← Voltar
            </button>
            {openSheet?.kind === "mech" && <MechSheetView sheet={openSheet} c={open} editable />}
            {openSheet?.kind === "npc" && <NpcSheetView sheet={openSheet} c={open} editable />}
            {!openSheet && (
              <p className="muted">
                A ficha de {open.name} ainda não chegou a este dispositivo. Ela é enviada automaticamente enquanto o dono
                estiver online{open.owner === session.playerId ? ", ou importe o arquivo do COMP/CON de novo" : ""}.
              </p>
            )}
          </div>
        ) : (
          <>
            <nav className="tabs">
              {tabs.map((t) => (
                <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </nav>
            <main className="content">
              {tab === "mechs" && (
                <div className="stack">
                  <ImportButton mode="mech" />
                  <CombatantList
                    list={mine}
                    empty={
                      isGM
                        ? "Nenhum lancer ainda. Os jogadores importam os próprios pilotos do COMP/CON, ou você pode importar por eles."
                        : "Exporte seu piloto no COMP/CON (Piloto → Exportar → JSON) e importe aqui."
                    }
                  />
                </div>
              )}
              {tab === "npcs" && isGM && <TemplateList onOpen={setOpenTemplateId} />}
              {tab === "encounter" && <EncounterPanel />}
              {tab === "guide" && (
                <div className="stack">
                  <h3>Guia rápido de ações</h3>
                  <p className="muted small">
                    Para usar uma ação e marcar o que já foi gasto no turno, abra a ficha do mech (seção “Ações do turno”) ou
                    use “📖 Ações” na lista do encontro.
                  </p>
                  <ActionGuide />
                </div>
              )}
              {tab === "rolls" && <RollLogView />}
            </main>
          </>
        )}
      </div>
    </AppContext.Provider>
  );
}
