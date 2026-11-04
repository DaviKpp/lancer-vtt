// GM-only NPC template library.
//
// Templates are the NPCs imported from COMP/CON. They are not combatants: they
// live only in the GM's browser (localStorage, shared across all rooms) and are
// used to spawn as many numbered copies as needed into an encounter.
import type { NpcSheet } from "../lib/types";

const KEY = "lancer-vtt:npc-templates";

class TemplateStore {
  private items: NpcSheet[] = [];
  private listeners = new Set<() => void>();
  private loaded = false;

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.items = JSON.parse(raw);
    } catch {
      this.items = [];
    }
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.items));
    } catch {
      // storage full/unavailable: templates last for this session only
    }
    this.items = [...this.items];
    this.listeners.forEach((fn) => fn());
  }

  list(): NpcSheet[] {
    this.load();
    return this.items;
  }

  get(id: string): NpcSheet | undefined {
    return this.list().find((t) => t.id === id);
  }

  add(sheets: NpcSheet[]) {
    this.load();
    this.items = [...this.items, ...sheets].sort((a, b) => a.name.localeCompare(b.name));
    this.save();
  }

  /** Replace templates in place (same id), e.g. after re-parsing with a newly imported content pack. */
  replace(sheets: NpcSheet[]) {
    this.load();
    const byId = new Map(sheets.map((s) => [s.id, s]));
    this.items = this.items.map((t) => byId.get(t.id) ?? t);
    this.save();
  }

  remove(id: string) {
    this.load();
    this.items = this.items.filter((t) => t.id !== id);
    this.save();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const templateStore = new TemplateStore();
