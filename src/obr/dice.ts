// 3D dice on everyone's screen for rolls made by players.
// The roller broadcasts the dice to ALL; each background page opens a transparent popover
// (dice.html) that throws them and closes itself when done.
import OBR from "@owlbear-rodeo/sdk";
import type { RollResult } from "../lib/types";
import { diceForRoll, type DicePhase, type DiceShow } from "../lib/diceShow";
import { ID } from "./constants";
import { loadDiceSet } from "../lib/diceSets";

export const DICE_POPOVER_ID = `${ID}/dice`;
const DICE_CHANNEL = `${ID}/dice`;
// other players' dice box (top center, below Owlbear's top bar)
const BOX_W = 400;
const BOX_H = 230;
const BOX_TOP = 70;
/** The roller's dice popover says when its dice stopped (LOCAL), so the result can be revealed. */
export const DICE_SETTLED_CHANNEL = `${ID}/dice-settled`;
const SETTLE_TIMEOUT = 4500; // if the popover never reports (failed to open...), reveal anyway
const REVEAL_MARGIN = 300; // other players' popovers may start a little later than the roller's

/**
 * Throws the dice for a roll and waits until they stop, so nothing reveals the result early.
 * Returns whether dice were thrown (false: GM roll or a roll without dice — nothing to wait for).
 */
export async function throwDiceAndWait(r: RollResult, phase: DicePhase = "all"): Promise<boolean> {
  const found = diceForRoll(r, phase);
  if (!found) return false;
  let off: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // listen before throwing, so a fast "settled" can't be missed
  const settled = new Promise<void>((resolve) => {
    off = OBR.broadcast.onMessage(DICE_SETTLED_CHANNEL, (e) => {
      if ((e.data as { id?: string })?.id === found.id) resolve();
    });
    timer = setTimeout(resolve, SETTLE_TIMEOUT);
  });
  try {
    const thrown = await sendDice(found);
    if (thrown) {
      await settled;
      await new Promise((res) => setTimeout(res, REVEAL_MARGIN));
    }
    return thrown;
  } finally {
    off?.();
    clearTimeout(timer);
  }
}

/** Only rolls made by players are thrown on screen. Returns whether dice were thrown. */
async function sendDice(found: DiceShow): Promise<boolean> {
  try {
    if ((await OBR.player.getRole()) !== "PLAYER") return false;
    // the connection (not the user id) tells the roller's own tab apart, even with the same account in two tabs
    const show: DiceShow = { ...found, set: loadDiceSet(), byConn: await OBR.player.getConnectionId() };
    await OBR.broadcast.sendMessage(DICE_CHANNEL, show, { destination: "ALL" });
    return true;
  } catch (e) {
    console.warn("[lancer-vtt] dice broadcast failed", e);
    return false;
  }
}

/** Throws a sample of the player's dice on their own screen only (to try out a dice set). */
export async function previewDice(show: DiceShow) {
  await OBR.broadcast.sendMessage(DICE_CHANNEL, { ...show, byConn: await OBR.player.getConnectionId() }, { destination: "LOCAL" });
}

/** Background page: opens the dice popover when someone throws. */
export function listenDice() {
  return OBR.broadcast.onMessage(DICE_CHANNEL, async (event) => {
    const show = event.data as DiceShow;
    if (!show?.dice?.length) return;
    const [vw, vh] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
    const data = encodeURIComponent(JSON.stringify(show));
    // A new throw replaces the one on screen.
    await OBR.popover.close(DICE_POPOVER_ID).catch(() => undefined);
    const mine = show.byConn ? show.byConn === (await OBR.player.getConnectionId()) : !show.byId || show.byId === OBR.player.id;
    if (mine) {
      // the roller: big, in the middle of the screen, with the result caption
      await OBR.popover.open({
        id: DICE_POPOVER_ID,
        url: `/dice.html#${data}`,
        width: Math.round(Math.min(vw * 0.8, 960)),
        height: Math.round(Math.min(vh * 0.6, 520)),
        anchorReference: "POSITION",
        anchorPosition: { left: Math.round(vw / 2), top: Math.round(vh / 2) },
        anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
        transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
        hidePaper: true,
        disableClickAway: true,
      });
      return;
    }
    // everyone else: a small red-framed box at the top center, leaving the map free
    await OBR.popover.open({
      id: DICE_POPOVER_ID,
      url: `/dice.html?box=1#${data}`,
      width: Math.round(Math.min(BOX_W, vw - 32)),
      height: BOX_H,
      anchorReference: "POSITION",
      anchorPosition: { left: Math.round(vw / 2), top: BOX_TOP },
      anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
      transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
      hidePaper: true,
      disableClickAway: true,
    });
  });
}
