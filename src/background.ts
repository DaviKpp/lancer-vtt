// Background page: registers the token context-menu entries.
import OBR from "@owlbear-rodeo/sdk";
import { startHud } from "./obr/hud";
import { listenAnnouncements } from "./obr/announce";
import { startTargeting } from "./obr/targeting";
import { listenDice } from "./obr/dice";
import { startToasts } from "./obr/toast";
import { startFx } from "./obr/fx";
import { CONTEXT_LINK_ID, CONTEXT_OPEN_ID, CONTEXT_TURN_ID, LINK_KEY, LINK_MODAL_ID, OPEN_CHANNEL } from "./obr/constants";
import { pushToast } from "./obr/toast";
import { announce } from "./obr/announce";
import { getRoomState } from "./obr/room";
import { startTurn } from "./obr/turns";

/** Opens the extension on a combatant's sheet (the popover may not be mounted yet). */
async function openSheet(id: string) {
  // leave a note the popover reads on startup (same origin), and also broadcast
  try {
    localStorage.setItem("lancer-vtt:open", JSON.stringify({ id, ts: Date.now() }));
  } catch {
    // ignore
  }
  await OBR.action.open();
  // give the popover a moment to mount before asking it to show the sheet
  setTimeout(() => void OBR.broadcast.sendMessage(OPEN_CHANNEL, { id }, { destination: "LOCAL" }), 400);
}

OBR.onReady(() => {
  // Notifications in the dice-caption style (instead of Owlbear's bar).
  startToasts();
  // Damage / turn / roll announcements sent by other players.
  listenAnnouncements();
  // 3D dice thrown by players.
  listenDice();

  // "Link LANCER sheet" on any single character/mount token.
  OBR.contextMenu.create({
    id: CONTEXT_LINK_ID,
    icons: [
      {
        icon: "/link.svg",
        label: "Vincular ficha LANCER",
        filter: {
          max: 1,
          every: [
            { key: "layer", value: "CHARACTER", coordinator: "||" },
            { key: "layer", value: "MOUNT" },
          ],
        },
      },
    ],
    onClick(context) {
      const item = context.items[0];
      if (!item) return;
      void OBR.modal.open({
        id: LINK_MODAL_ID,
        url: `/link.html?item=${encodeURIComponent(item.id)}`,
        width: 380,
        height: 460,
      });
    },
  });

  // "Open LANCER sheet" on tokens that are already linked.
  OBR.contextMenu.create({
    id: CONTEXT_OPEN_ID,
    icons: [
      {
        icon: "/icon.svg",
        label: "Abrir ficha LANCER",
        filter: {
          max: 1,
          every: [{ key: ["metadata", LINK_KEY], value: undefined, operator: "!=" }],
        },
      },
    ],
    async onClick(context) {
      const link = context.items[0]?.metadata[LINK_KEY] as { id?: string } | undefined;
      if (link?.id) await openSheet(link.id);
    },
  });

  // "Start turn" on linked tokens: starts that character's turn and opens their sheet.
  OBR.contextMenu.create({
    id: CONTEXT_TURN_ID,
    icons: [
      {
        icon: "/turn.svg",
        label: "Iniciar turno LANCER",
        filter: {
          max: 1,
          every: [{ key: ["metadata", LINK_KEY], value: undefined, operator: "!=" }],
        },
      },
    ],
    async onClick(context) {
      const link = context.items[0]?.metadata[LINK_KEY] as { id?: string } | undefined;
      if (!link?.id) return;
      const [{ combatants }, role] = await Promise.all([getRoomState(), OBR.player.getRole()]);
      const c = combatants[link.id];
      if (!c) {
        pushToast("Esse token não está mais vinculado a um combatente LANCER.", "WARNING");
        return;
      }
      if (role !== "GM" && c.owner !== OBR.player.id) {
        pushToast(`Só o dono de ${c.name} ou o mestre podem iniciar o turno dele.`, "WARNING");
        return;
      }
      // a dismounted pilot acts in their mech's turn
      const actor = c.kind === "pilot" && c.pm && combatants[c.pm] ? combatants[c.pm] : c;
      await startTurn(actor.id);
      const msg = `Turno de ${actor.name}.`;
      pushToast(msg, "INFO");
      await announce(msg, "INFO", { local: false });
      await openSheet(c.id);
    },
  });
});

// Bars / labels over linked tokens (drawn locally, per viewer).
startHud();

// "Escolher alvo" tool + attacker → target arrows (drawn locally, per viewer).
startTargeting();

// Shot animations (bullets, beams, missiles...) between tokens.
startFx();
