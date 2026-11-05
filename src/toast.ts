// Toast popover: draws the queue kept by the background page (see obr/toast.ts).
import { readToasts, TOAST_STORAGE_KEY, type Toast } from "./obr/toast";

const list = document.getElementById("list")!;

/** "Name: what happened" → small name line + bold text, like the dice caption. */
function split(message: string) {
  const i = message.indexOf(": ");
  return i > 0 && i < 60 ? { who: message.slice(0, i), text: message.slice(i + 2) } : { who: "", text: message };
}

function render() {
  const toasts = readToasts();
  const ids = new Set(toasts.map((t) => t.id));
  // remove the ones that went away, keep existing nodes (no re-animation)
  for (const el of [...list.children] as HTMLElement[]) if (!ids.has(el.dataset.id!)) el.remove();
  for (const t of toasts) {
    if (list.querySelector(`[data-id="${t.id}"]`)) continue;
    list.appendChild(build(t));
  }
}

function build(t: Toast) {
  const el = document.createElement("div");
  el.className = `toast ${t.variant}`;
  el.dataset.id = t.id;
  const { who, text } = split(t.message);
  if (who) {
    const w = document.createElement("div");
    w.className = "who";
    w.textContent = who;
    el.appendChild(w);
  }
  const m = document.createElement("div");
  m.className = "text";
  m.textContent = text;
  el.title = t.message;
  el.appendChild(m);
  // click to dismiss: the background page sees the shared list change
  el.addEventListener("click", () => {
    localStorage.setItem(TOAST_STORAGE_KEY, JSON.stringify(readToasts().filter((x) => x.id !== t.id)));
    render();
  });
  return el;
}

window.addEventListener("storage", (e) => {
  if (e.key === TOAST_STORAGE_KEY) render();
});
render();
