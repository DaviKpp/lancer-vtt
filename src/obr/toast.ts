// Extension notifications in the dice-caption style (dark card, colored stripe, bottom center),
// instead of Owlbear's own notification bar.
//
// Any page of the extension calls notify(); the message goes over a LOCAL broadcast to the
// background page, which keeps the queue (up to 3 at once) and shows them in a small transparent
// popover (toast.html). The queue is shared with that popover through localStorage (same origin).
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants";

export type Variant = "DEFAULT" | "ERROR" | "INFO" | "SUCCESS" | "WARNING";

export interface Toast {
  id: string;
  message: string;
  variant: Variant;
}

export const TOAST_POPOVER_ID = `${ID}/toast`;
export const TOAST_STORAGE_KEY = "lancer-vtt:toasts";
const TOAST_CHANNEL = `${ID}/toast`;
const MAX_VISIBLE = 3;
const ROW_H = 62; // px per toast, see toast.html
const WIDTH = 560;
const BOTTOM_GAP = 80; // px from the bottom of the screen, clear of the toolbar

/** Shows a notification on this player's screen. */
export async function notify(message: string, variant: Variant = "INFO") {
  if (!message) return;
  try {
    await OBR.broadcast.sendMessage(TOAST_CHANNEL, { message, variant }, { destination: "LOCAL" });
  } catch (e) {
    console.warn("[lancer-vtt] notify failed", e);
  }
}

export function readToasts(): Toast[] {
  try {
    const list = JSON.parse(localStorage.getItem(TOAST_STORAGE_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeToasts(list: Toast[]) {
  try {
    localStorage.setItem(TOAST_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------- background side

let items: Toast[] = [];
let open = false;
let seq = 0;

async function sync() {
  writeToasts(items);
  try {
    if (!items.length) {
      if (open) await OBR.popover.close(TOAST_POPOVER_ID);
      open = false;
      return;
    }
    const height = items.length * ROW_H + 12;
    if (open) {
      await OBR.popover.setHeight(TOAST_POPOVER_ID, height);
      return;
    }
    const [vw, vh] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
    open = true;
    await OBR.popover.open({
      id: TOAST_POPOVER_ID,
      url: "/toast.html",
      width: Math.round(Math.min(WIDTH, vw - 32)),
      height,
      anchorReference: "POSITION",
      // above Owlbear's bottom toolbar
      anchorPosition: { left: Math.round(vw / 2), top: Math.round(vh - BOTTOM_GAP) },
      anchorOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      transformOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      hidePaper: true,
      disableClickAway: true,
    });
  } catch (e) {
    open = false;
    console.warn("[lancer-vtt] toast popover failed", e);
  }
}

/** Background page: queue a toast directly. */
export function pushToast(message: string, variant: Variant = "INFO") {
  if (!message) return;
  const t: Toast = { id: `${Date.now()}-${seq++}`, message, variant };
  items = [...items, t].slice(-MAX_VISIBLE);
  void sync();
  const ms = variant === "ERROR" || variant === "WARNING" ? 7000 : 5000;
  setTimeout(() => {
    if (!items.some((x) => x.id === t.id)) return;
    items = items.filter((x) => x.id !== t.id);
    void sync();
  }, ms);
}

/** Background page: show the toasts other pages of the extension send. */
export function startToasts() {
  writeToasts([]);
  OBR.broadcast.onMessage(TOAST_CHANNEL, (e) => {
    const m = e.data as { message?: string; variant?: Variant };
    if (m?.message) pushToast(m.message, m.variant ?? "INFO");
  });
  // A toast clicked away in the popover removes itself from the shared list.
  window.addEventListener("storage", (e) => {
    if (e.key !== TOAST_STORAGE_KEY) return;
    const ids = new Set(readToasts().map((t) => t.id));
    const next = items.filter((t) => ids.has(t.id));
    if (next.length !== items.length) {
      items = next;
      void sync();
    }
  });
}
