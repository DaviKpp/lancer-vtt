/* eslint-disable @typescript-eslint/no-explicit-any */
// LANCER Content Packs (.lcp) imported by the GM, e.g. the official "LANCER Core NPCs" pack
// that comes with the core book, or Long Rim / Wallflower / homebrew packs.
// They are only used to resolve item IDs that old (v2) COMP/CON exports reference
// without embedding the data. Stored in the GM's browser, shared across rooms.
import { readZip } from "./zip";

export const LCP_TABLES = [
  "frames",
  "weapons",
  "systems",
  "mods",
  "talents",
  "core_bonuses",
  "tags",
  "pilot_gear",
  "manufacturers",
  "npc_classes",
  "npc_features",
  "npc_templates",
] as const;
export type LcpTable = (typeof LCP_TABLES)[number];

export interface LcpPack {
  id: string;
  name: string;
  version: string;
  counts: Partial<Record<LcpTable, number>>;
  data: Partial<Record<LcpTable, any[]>>;
}

const KEY = "lancer-vtt:lcps";

const PREFIXES: [string, LcpTable][] = [
  ["npcc_", "npc_classes"],
  ["npct_", "npc_templates"],
  ["npcf_", "npc_features"],
  ["mf_", "frames"],
  ["mw_", "weapons"],
  ["ms_", "systems"],
  ["mm_", "mods"],
  ["cb_", "core_bonuses"],
  ["tg_", "tags"],
  ["pg_", "pilot_gear"],
  ["t_", "talents"],
];

function classify(item: any): LcpTable | undefined {
  if (!item || typeof item !== "object" || typeof item.id !== "string") return undefined;
  if (item.template === true) return "npc_templates";
  const byPrefix = PREFIXES.find(([p]) => item.id.startsWith(p))?.[1];
  if (byPrefix) return byPrefix;
  // homebrew without standard prefixes
  if (item.role && item.stats) return "npc_classes";
  if (item.origin && item.type) return "npc_features";
  return undefined;
}

class LcpStore {
  private packs: LcpPack[] = [];
  private loaded = false;
  private index: Map<string, any> | null = null;
  private listeners = new Set<() => void>();

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      this.packs = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    } catch {
      this.packs = [];
    }
  }

  private save() {
    this.index = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.packs));
    } catch {
      throw new Error("O armazenamento do navegador está cheio; o content pack só vale até recarregar a página.");
    } finally {
      this.packs = [...this.packs];
      this.listeners.forEach((fn) => fn());
    }
  }

  list(): LcpPack[] {
    this.load();
    return this.packs;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  lookup(table: LcpTable, id: string): any | undefined {
    this.load();
    if (!this.index) {
      this.index = new Map();
      for (const p of this.packs)
        for (const t of LCP_TABLES) for (const item of p.data[t] ?? []) if (item?.id) this.index.set(`${t}:${item.id}`, item);
    }
    return this.index.get(`${table}:${id}`);
  }

  async importFile(file: File): Promise<LcpPack> {
    this.load();
    const files = await readZip(await file.arrayBuffer(), (n) => n.toLowerCase().endsWith(".json"));
    const decoder = new TextDecoder();
    const pack: LcpPack = { id: file.name, name: file.name.replace(/\.lcp$/i, ""), version: "", counts: {}, data: {} };
    for (const [path, bytes] of files) {
      const base = path.split("/").pop()!.toLowerCase().replace(/\.json$/, "");
      let json: any;
      try {
        json = JSON.parse(decoder.decode(bytes));
      } catch {
        continue;
      }
      if (base === "lcp_manifest") {
        pack.name = json.name ?? pack.name;
        pack.version = json.version ?? "";
        pack.id = `${pack.name}@${pack.version}`;
        continue;
      }
      if (!Array.isArray(json)) continue;
      // Older packs use one file per table (npc_features.json...). Current packs (v3) use one
      // file per class/template (npcc_hive.json) mixing the class and its features, so every
      // entry is classified by its ID prefix / shape.
      const fileTable = LCP_TABLES.find((t) => t === base);
      for (const item of json) {
        const table = fileTable ?? classify(item);
        if (!table) continue;
        (pack.data[table] ??= []).push(item);
      }
    }
    for (const t of LCP_TABLES) if (pack.data[t]) pack.counts[t] = pack.data[t]!.length;
    if (!Object.keys(pack.data).length) throw new Error("Nenhum dado de LANCER encontrado nesse arquivo.");
    this.packs = [...this.packs.filter((p) => p.name !== pack.name), pack];
    this.save();
    return pack;
  }

  remove(id: string) {
    this.load();
    this.packs = this.packs.filter((p) => p.id !== id);
    this.save();
  }
}

export const lcpStore = new LcpStore();
