import { useEffect, useState } from "react";
import OBR, { type Item } from "@owlbear-rodeo/sdk";
import type { CombatantState } from "../lib/types";
import { linkToken, unlinkToken } from "../obr/room";
import { useApp } from "./AppContext";

/** Shows the token link for a combatant and lets its owner (or the GM) link the selected token. */
export function LinkControls({ c, editable }: { c: CombatantState; editable: boolean }) {
  const app = useApp();
  const [tokenName, setTokenName] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!app.sceneReady || !c.tokenId) {
      setTokenName(null);
      setMissing(false);
      return;
    }
    const update = (items: Item[]) => {
      const item = items.find((i) => i.id === c.tokenId);
      setTokenName(item ? item.name || "Token" : null);
      setMissing(!item);
    };
    OBR.scene.items.getItems([c.tokenId]).then(update);
    return OBR.scene.items.onChange(update);
  }, [app.sceneReady, c.tokenId]);

  const linkSelected = async () => {
    const sel = await OBR.player.getSelection();
    if (!sel || sel.length !== 1) {
      await OBR.notification.show("Selecione exatamente um token no mapa e clique em Vincular.", "WARNING");
      return;
    }
    const [item] = await OBR.scene.items.getItems(sel);
    if (!item || (item.layer !== "CHARACTER" && item.layer !== "MOUNT")) {
      await OBR.notification.show("Só tokens de personagem ou montaria podem ser vinculados.", "WARNING");
      return;
    }
    await linkToken(c.id, item.id);
    await OBR.notification.show(`${c.name} vinculado a ${item.name || "token"}.`, "SUCCESS");
  };

  return (
    <div className="link-controls">
      <span className="tracker-label">Token</span>
      <span className={`link-status ${c.tokenId && !missing ? "linked" : ""}`}>
        {!c.tokenId ? "Sem vínculo" : missing ? "Token vinculado não está nesta cena" : `Vinculado: ${tokenName ?? "…"}`}
      </span>
      {app.sceneReady && (
        <div className="row gap">
          {c.tokenId && !missing && (
            <button className="btn-small ghost" onClick={() => OBR.player.select([c.tokenId as string], true)}>
              Localizar
            </button>
          )}
          {editable && (
            <button className="btn-small" onClick={linkSelected} title="Vincular o token selecionado no mapa">
              {c.tokenId ? "Revincular selecionado" : "Vincular token selecionado"}
            </button>
          )}
          {editable && c.tokenId && (
            <button className="btn-small ghost" onClick={() => unlinkToken(c.id)}>
              Desvincular
            </button>
          )}
        </div>
      )}
      {!app.sceneReady && <span className="muted small">Abra uma cena para vincular tokens.</span>}
    </div>
  );
}
