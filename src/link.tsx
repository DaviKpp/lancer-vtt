// Modal opened from the token context menu: pick which sheet to link to the token.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import OBR, { type Item } from "@owlbear-rodeo/sdk";
import { LINK_MODAL_ID } from "./obr/constants";
import { getRoomState, linkToken, unlinkToken } from "./obr/room";
import type { CombatantState } from "./lib/types";
import { useObrTheme } from "./obr/hooks";
import "./styles.css";
import { notify } from "./obr/toast";

function LinkModal() {
  const itemId = new URLSearchParams(location.search).get("item") ?? "";
  const [ready, setReady] = useState(false);
  const [item, setItem] = useState<Item | null>(null);
  const [options, setOptions] = useState<CombatantState[]>([]);
  const [linked, setLinked] = useState<CombatantState | null>(null);
  useObrTheme(ready);

  useEffect(() => {
    OBR.onReady(async () => {
      const [role, playerId, room, items] = await Promise.all([
        OBR.player.getRole(),
        OBR.player.getId(),
        getRoomState(),
        OBR.scene.items.getItems([itemId]),
      ]);
      const all = Object.values(room.combatants);
      setItem(items[0] ?? null);
      setLinked(all.find((c) => c.tokenId === itemId) ?? null);
      // Players can only link their own mechs; the GM can link anything.
      setOptions(
        all
          .filter((c) => role === "GM" || c.owner === playerId)
          .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "mech" ? -1 : 1)),
      );
      setReady(true);
    });
  }, [itemId]);

  const close = () => OBR.modal.close(LINK_MODAL_ID);

  const choose = async (c: CombatantState) => {
    await linkToken(c.id, itemId);
    await notify(`${item?.name || "Token"} vinculado a ${c.name}.`, "SUCCESS");
    await close();
  };

  if (!ready) return <div className="loading">Carregando…</div>;
  return (
    <div className="app modal">
      <header className="app-head">
        <span className="logo">LANCER</span>
        <span className="muted small">Vincular “{item?.name || "token"}”</span>
        <span className="spacer" />
        <button className="icon-btn" onClick={close} aria-label="Fechar">
          ×
        </button>
      </header>
      <main className="content stack">
        {linked && (
          <div className="row between card">
            <span>
              Vinculado a <strong>{linked.name}</strong>
            </span>
            {options.some((o) => o.id === linked.id) && (
              <button
                className="btn-small ghost"
                onClick={async () => {
                  await unlinkToken(linked.id);
                  await close();
                }}
              >
                Desvincular
              </button>
            )}
          </div>
        )}
        {options.length === 0 && <p className="muted">Nada para vincular ainda. Importe um arquivo do COMP/CON pelo painel LANCER primeiro.</p>}
        {options.map((c) => (
          <button key={c.id} className="combatant-main option" onClick={() => choose(c)}>
            <strong>{c.name}</strong>
            <span className="muted small">
              {c.kind === "npc" ? "NPC · " : ""}
              {c.sub}
              {c.tokenId && c.tokenId !== itemId ? " · vinculado a outro token" : ""}
            </span>
          </button>
        ))}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <LinkModal />
  </StrictMode>,
);
