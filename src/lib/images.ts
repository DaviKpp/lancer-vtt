/* eslint-disable @typescript-eslint/no-explicit-any */
// Portraits from COMP/CON exports.
//  v3: { img: { cloud_portrait, portrait, avatar: { image: { src } } } }
//  v2: cloud_portrait / portrait on pilots and mechs; cloudImage / localImage on NPCs.
// Only web URLs (and data: images) are usable — COMP/CON's local files live on the player's PC.

function usable(src: unknown): string | undefined {
  return typeof src === "string" && /^(https?:\/\/|data:image\/)/i.test(src.trim()) ? src.trim() : undefined;
}

export function portraitOf(d: any): string | undefined {
  if (!d || typeof d !== "object") return undefined;
  const img = d.img ?? {};
  return (
    usable(img.cloud_portrait) ??
    usable(img.avatar?.image?.src) ??
    usable(img.portrait) ??
    usable(d.cloud_portrait) ??
    usable(d.portrait) ??
    usable(d.cloudImage) ??
    usable(d.localImage)
  );
}

/** URLs short enough to share in room metadata (data: URLs stay in the sheet only). */
export function shareableImage(src?: string): string | undefined {
  return src && /^https?:\/\//i.test(src) && src.length <= 400 ? src : undefined;
}

import type { CombatantState, Sheet } from "./types";

/** Best portrait for a combatant: shared URL, else the local sheet's image. */
export function imageFor(c: CombatantState | undefined, sheet?: Sheet): string | undefined {
  if (c?.im) return c.im;
  if (!sheet) return undefined;
  return sheet.kind === "mech" ? sheet.mech.image ?? sheet.pilot.image : sheet.image;
}
