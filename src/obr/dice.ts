// 3D dice on everyone's screen for rolls made by players.
// The roller broadcasts the dice to ALL; each background page opens a transparent popover
// (dice.html) that throws them and closes itself when done.
import OBR from "@owlbear-rodeo/sdk";
import type { RollResult } from "../lib/types";
import { diceForRoll, type DiceShow } from "../lib/diceShow";
import { ID } from "./constants";
import { loadDiceSet } from "../lib/diceSets";

export const DICE_POPOVER_ID = `${ID}/dice`;
const DICE_CHANNEL = `${ID}/dice`;

/** Called for every published roll: only rolls made by players are thrown on screen. */
export async function throwDice(r: RollResult) {
  const found = diceForRoll(r);
  if (!found) return;
  const show: DiceShow = { ...found, set: loadDiceSet() };
  try {
    if ((await OBR.player.getRole()) !== "PLAYER") return;
    await OBR.broadcast.sendMessage(DICE_CHANNEL, show, { destination: "ALL" });
  } catch (e) {
    console.warn("[lancer-vtt] dice broadcast failed", e);
  }
}

/** Throws a sample of the player's dice on their own screen only (to try out a dice set). */
export async function previewDice(show: DiceShow) {
  await OBR.broadcast.sendMessage(DICE_CHANNEL, show, { destination: "LOCAL" });
}

/** Background page: opens the dice popover when someone throws. */
export function listenDice() {
  return OBR.broadcast.onMessage(DICE_CHANNEL, async (event) => {
    const show = event.data as DiceShow;
    if (!show?.dice?.length) return;
    const [vw, vh] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
    const width = Math.round(Math.min(vw * 0.8, 960));
    const height = Math.round(Math.min(vh * 0.6, 520));
    // A new throw replaces the one on screen.
    await OBR.popover.close(DICE_POPOVER_ID).catch(() => undefined);
    await OBR.popover.open({
      id: DICE_POPOVER_ID,
      url: `/dice.html#${encodeURIComponent(JSON.stringify(show))}`,
      width,
      height,
      anchorReference: "POSITION",
      anchorPosition: { left: Math.round(vw / 2), top: Math.round(vh / 2) },
      anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
      transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
      hidePaper: true,
      disableClickAway: true,
    });
  });
}
