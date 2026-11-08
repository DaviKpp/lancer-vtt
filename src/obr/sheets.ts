// Sheet storage and sharing.
//
// Sheets (the parsed COMP/CON content) are too big for room metadata, so:
//  - the uploader keeps them in localStorage (per room), and
//  - they are sent to the GM (and back to their owner on another device) over
//    OBR broadcast, split into chunks to respect the 16KB message limit.
// The GM caches every sheet it receives, so it can see all mechs.
import OBR from "@owlbear-rodeo/sdk";
import type { CombatantState, Sheet } from "../lib/types";
import { SHEET_CHANNEL } from "./constants";

type Msg =
  | { t: "req"; ids: string[] }
  | { t: "chunk"; id: string; i: number; n: number; s: string }
  | { t: "drop"; id: string };

const CHUNK_SIZE = 6000; // characters; keeps each message well under 16KB even with multi-byte text

type Identity = { playerId: string; role: "GM" | "PLAYER" };
type Listener = () => void;

class SheetStore {
  private sheets = new Map<string, Sheet>();
  private listeners = new Set<Listener>();
  private roomId = "";
  private identity: Identity = { playerId: "", role: "PLAYER" };
  private combatants: Record<string, CombatantState> = {};
  private partial = new Map<string, { n: number; parts: string[] }>();
  private requested = new Map<string, number>();
  private started = false;
  private snapshot: ReadonlyMap<string, Sheet> = new Map();
  /** Sheets that arrived before their room entry (broadcast can beat metadata). */
  private orphans = new Map<string, { sheet: Sheet; at: number }>();

  start(roomId: string, identity: Identity) {
    this.identity = identity;
    if (this.started && this.roomId === roomId) return;
    this.roomId = roomId;
    this.started = true;
    this.load();
    OBR.broadcast.onMessage(SHEET_CHANNEL, (event) => this.onMessage(event.data as Msg));
  }

  setIdentity(identity: Identity) {
    this.identity = identity;
  }

  /**
   * Called whenever room state changes: fetches missing sheets. Sheets are NOT dropped just because
   * their combatant is missing from the room for a moment (a refused write, a restore on the way):
   * they go only when someone removes the combatant on purpose (`forget`, broadcast as "drop").
   */
  syncWithRoom(combatants: Record<string, CombatantState>) {
    this.combatants = combatants;
    let changed = false;
    for (const [id, o] of Array.from(this.orphans)) {
      if (this.canHold(combatants[id])) {
        this.sheets.set(id, o.sheet);
        this.orphans.delete(id);
        changed = true;
      } else if (Date.now() - o.at > 60000) this.orphans.delete(id);
    }
    if (changed) this.persistAndNotify();
    const missing = Object.values(combatants)
      .filter((c) => this.canHold(c) && !this.sheets.has(c.id))
      .map((c) => c.id)
      .filter((id) => Date.now() - (this.requested.get(id) ?? 0) > 10000);
    if (missing.length) {
      missing.forEach((id) => this.requested.set(id, Date.now()));
      void this.send({ t: "req", ids: missing });
    }
  }

  get(id: string): Sheet | undefined {
    return this.sheets.get(id);
  }

  all(): ReadonlyMap<string, Sheet> {
    return this.snapshot;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Save a sheet locally and (optionally) share it with the other clients that may hold it. */
  async add(sheet: Sheet, share = true) {
    this.sheets.set(sheet.id, sheet);
    this.persistAndNotify();
    if (share) await this.push(sheet);
  }

  /** Save several sheets locally without broadcasting (e.g. GM-owned NPC instances). */
  addLocal(sheets: Sheet[]) {
    for (const s of sheets) this.sheets.set(s.id, s);
    this.persistAndNotify();
  }

  remove(id: string) {
    if (this.sheets.delete(id)) this.persistAndNotify();
  }

  /** The combatant was removed on purpose: drop its sheet here and on every other client. */
  async forget(id: string) {
    this.remove(id);
    await this.send({ t: "drop", id });
  }

  // ---------- internals ----------

  private canHold(c: CombatantState | undefined): boolean {
    if (!c) return false;
    return this.identity.role === "GM" || c.owner === this.identity.playerId;
  }

  private storageKey() {
    return `lancer-vtt:${this.roomId}:sheets`;
  }

  private load() {
    this.sheets.clear();
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (raw) for (const s of JSON.parse(raw) as Sheet[]) this.sheets.set(s.id, s);
    } catch {
      // storage unavailable (private mode) — keep in memory only
    }
    this.snapshot = new Map(this.sheets);
    this.notify();
  }

  private persistAndNotify() {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(Array.from(this.sheets.values())));
    } catch {
      // quota exceeded or unavailable; sheets still work for this session
    }
    this.snapshot = new Map(this.sheets);
    this.notify();
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private async send(msg: Msg) {
    try {
      await OBR.broadcast.sendMessage(SHEET_CHANNEL, msg, { destination: "REMOTE" });
    } catch (e) {
      console.warn("[lancer-vtt] broadcast failed", e);
    }
  }

  private async push(sheet: Sheet) {
    const json = JSON.stringify(sheet);
    const n = Math.ceil(json.length / CHUNK_SIZE);
    for (let i = 0; i < n; i++) {
      await this.send({ t: "chunk", id: sheet.id, i, n, s: json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
      if (n > 1) await new Promise((r) => setTimeout(r, 80));
    }
  }

  private onMessage(msg: Msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "req") {
      for (const id of msg.ids) {
        const sheet = this.sheets.get(id);
        const c = this.combatants[id];
        // Owners answer for their own sheets; the GM answers from its cache.
        if (sheet && (this.identity.role === "GM" || c?.owner === this.identity.playerId)) void this.push(sheet);
      }
    } else if (msg.t === "chunk") {
      const known = !!this.combatants[msg.id];
      if (known && !this.canHold(this.combatants[msg.id])) return;
      const entry = this.partial.get(msg.id) ?? { n: msg.n, parts: new Array(msg.n).fill("") };
      if (entry.n !== msg.n) {
        entry.n = msg.n;
        entry.parts = new Array(msg.n).fill("");
      }
      entry.parts[msg.i] = msg.s;
      this.partial.set(msg.id, entry);
      if (entry.parts.every((p) => p.length > 0)) {
        this.partial.delete(msg.id);
        try {
          const sheet = JSON.parse(entry.parts.join("")) as Sheet;
          if (!known) {
            this.orphans.set(sheet.id, { sheet, at: Date.now() });
            return;
          }
          this.sheets.set(sheet.id, sheet);
          this.persistAndNotify();
        } catch {
          // corrupted transfer; it will be requested again
          this.requested.delete(msg.id);
        }
      }
    } else if (msg.t === "drop") {
      this.remove(msg.id);
    }
  }
}

export const sheetStore = new SheetStore();
