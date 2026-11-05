// Game announcements (damage, healing, turns, rolls) shown to everyone in the room.
// The sender shows the notification locally and broadcasts it; every other player's
// background page (always loaded, even with the popover closed) shows it on arrival.
import OBR from "@owlbear-rodeo/sdk";
import type { CombatantState } from "../lib/types";
import { ANNOUNCE_CHANNEL } from "./constants";
import { notify, pushToast } from "./toast";

type Variant = "DEFAULT" | "ERROR" | "INFO" | "SUCCESS" | "WARNING";

interface Announcement {
  message: string;
  variant: Variant;
  /** Owner of the combatant the message is about; players who can't see its sheet get `publicMessage` instead. */
  owner?: string;
  publicMessage?: string;
}

export async function announce(
  message: string,
  variant: Variant = "INFO",
  /** local: false = only the other players get it (e.g. the roller already sees the dice caption). */
  opts: { subject?: CombatantState; publicMessage?: string; local?: boolean } = {},
) {
  if (!message) return;
  if (opts.local !== false) await notify(message, variant);
  const msg: Announcement = { message, variant };
  if (opts.subject) {
    msg.owner = opts.subject.owner;
    msg.publicMessage = opts.publicMessage ?? message;
  }
  try {
    await OBR.broadcast.sendMessage(ANNOUNCE_CHANNEL, msg, { destination: "REMOTE" });
  } catch (e) {
    console.warn("[lancer-vtt] announce failed", e);
  }
}

/** Damage / heat log without hidden numbers (armor, overshield, remaining structure / stress). */
export function publicLog(log: string[]): string {
  return log
    .filter((l) => !/^(Armadura|Sobrescudo|Resistência)/.test(l))
    .map((l) => l.replace(/^(Dano de estrutura!|Superaquecimento!).*/, "$1"))
    .join(" · ");
}

/** Background page: shows announcements sent by other players. */
export function listenAnnouncements() {
  return OBR.broadcast.onMessage(ANNOUNCE_CHANNEL, async (event) => {
    const a = event.data as Announcement;
    if (!a?.message) return;
    let text = a.message;
    if (a.owner !== undefined) {
      const role = await OBR.player.getRole();
      if (role !== "GM" && a.owner !== OBR.player.id) text = a.publicMessage ?? "";
    }
    if (text) pushToast(text, a.variant);
  });
}
