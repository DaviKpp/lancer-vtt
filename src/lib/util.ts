/* eslint-disable @typescript-eslint/no-explicit-any */

export function uid(len = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join("");
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/** Effects in lancer-data are either strings or ActiveEffect objects ({ name, detail }). */
export function toText(v: any): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join("<br>") || undefined;
  if (typeof v === "object") {
    const parts = [v.detail, v.effect, v.description].filter((x) => typeof x === "string" && x);
    if (parts.length) return (v.name ? `<b>${v.name}:</b> ` : "") + parts[0];
  }
  return undefined;
}

/** Pick the value for an NPC tier from `n`, `[t1,t2,t3]` or nested arrays. */
export function tierValue<T = number>(v: any, tier: number): T | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) {
    if (v.length === 0) return undefined;
    const picked = v[Math.min(Math.max(tier - 1, 0), v.length - 1)];
    return Array.isArray(picked) ? (picked[0] as T) : (picked as T);
  }
  return v as T;
}

/** Replace COMP/CON tiered text "{2/3/4}" with the value for the given tier. */
export function resolveTierText(text: string | undefined, tier: number): string | undefined {
  if (!text) return text;
  return text.replace(/\{([^{}/]+)\/([^{}/]+)\/([^{}/]+)\}/g, (_m, a, b, c) => [a, b, c][Math.min(Math.max(tier - 1, 0), 2)]);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
