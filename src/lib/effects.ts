/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StatusEffect } from "./types";

/** Statuses an effect imposes on others (entries targeting "self" are ignored). */
export function statusesOf(raw: any): StatusEffect[] | undefined {
  const list = raw && typeof raw === "object" && Array.isArray(raw.add_status) ? raw.add_status : [];
  const saveAll = typeof raw?.save === "string" ? raw.save : raw?.save?.stat;
  const out = list
    .filter((s: any) => s?.id && s.target !== "self")
    .map((s: any) => ({ id: String(s.id), save: s.save ?? saveAll ?? undefined }));
  return out.length ? out : undefined;
}
