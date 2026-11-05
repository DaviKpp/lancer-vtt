// Extension notifications in the dice-caption style (dark card, colored stripe, bottom center),
// instead of Owlbear's own notification bar.
//
// Any page of the extension calls notify(); the message goes over a LOCAL broadcast to the
// background page, which keeps the queue (up to 3 at once) and shows them in a small transparent
// popover (toast.html). The queue is shared with that popover through localStorage (same origin),
// under a key unique to this tab so two Owlbear tabs in the same browser don't mix their toasts.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants";

export type Variant = "DEFAULT" | "ERROR" | "INFO" | "SUCCESS" | "WARNING";

export interface Toast {
  id: string;
  message: string;
  variant: Variant;
}

export const TOAST_POPOVER_ID = `${ID}/toast`;
const TOAST_STORAGE_PREFIX = "lancer-vtt:toasts:";
/** Storage key for one tab's queue (the popover gets the tab id in its URL). */
export const toastKey = (tab: string) => `${TOAST_STORAGE_PREFIX}${tab}`;
const TAB = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const TOAST_CHANNEL = `${ID}/toast`;
const MAX_VISIBLE = 3;
const ROW_H = 72; // first guess of the height per toast; the popover then measures itself
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

export function readToasts(key: string): Toast[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeToasts(list: Toast[]) {
  try {
    if (list.length) localStorage.setItem(toastKey(TAB), JSON.stringify(list));
    else localStorage.removeItem(toastKey(TAB));
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
    // already open: the popover sees the new list and resizes itself
    if (open) return;
    open = true; // before any await, so two quick toasts don't open it twice
    const height = items.length * ROW_H + 12;
    const [vw, vh] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
    await OBR.popover.open({
      id: TOAST_POPOVER_ID,
      url: `/toast.html?tab=${TAB}`,
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
  window.addEventListener("beforeunload", () => writeToasts([]));
  // queues left behind by tabs that closed without cleaning up
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(TOAST_STORAGE_PREFIX) && k !== toastKey(TAB)) {
        const list = JSON.parse(localStorage.getItem(k) ?? "[]") as Toast[];
        const newest = Math.max(0, ...list.map((t) => Number(String(t.id).split("-")[0]) || 0));
        if (Date.now() - newest > 60_000) localStorage.removeItem(k);
      }
    }
  } catch {
    // ignore
  }
  OBR.broadcast.onMessage(TOAST_CHANNEL, (e) => {
    const m = e.data as { message?: string; variant?: Variant };
    if (m?.message) pushToast(m.message, m.variant ?? "INFO");
  });
  // A toast clicked away in the popover removes itself from the shared list.
  window.addEventListener("storage", (e) => {
    if (e.key !== toastKey(TAB)) return;
    const ids = new Set(readToasts(toastKey(TAB)).map((t) => t.id));
    const next = items.filter((t) => ids.has(t.id));
    if (next.length !== items.length) {
      items = next;
      void sync();
    }
  });
}
