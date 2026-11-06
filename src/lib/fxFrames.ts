import { shade } from "./diceSets";

// Attack animations on the map, as plain geometry (no Owlbear here, so they can be previewed anywhere).
// Each style gives a duration and, for any time t, the shapes to draw: filled polygons or stroked
// lines in map coordinates. obr/fx.ts turns them into local items on every player's screen.

export type FxStyle = "bullets" | "shotgun" | "cannon" | "beam" | "missile" | "flame" | "melee" | "tech";

export const FX_LABEL: Record<FxStyle, string> = {
  bullets: "Rajada",
  shotgun: "Chumbo",
  cannon: "Canhão",
  beam: "Feixe",
  missile: "Míssil",
  flame: "Chamas",
  melee: "Corpo a corpo",
  tech: "Tech",
};

/** Which animation an attack gets, from the weapon's type and damage. */
export function weaponFx(opts: { kind: "attack" | "tech"; type?: string; damage?: { type: string }[]; melee?: boolean }): FxStyle {
  if (opts.kind === "tech") return "tech";
  if (opts.melee || /melee/i.test(opts.type ?? "")) return "melee";
  const dmg = (opts.damage ?? []).map((d) => d.type.toLowerCase());
  const type = (opts.type ?? "").toLowerCase();
  if (/launcher|missile|rocket|grenade|mortar/.test(type) || dmg[0] === "explosive") return "missile";
  if (dmg[0] === "burn" || /flame|incinerat/.test(type)) return "flame";
  if (dmg[0] === "energy" || dmg[0] === "heat") return "beam";
  if (/cqb|shotgun/.test(type)) return "shotgun";
  if (/cannon/.test(type)) return "cannon";
  return "bullets";
}

/** A player's customization of their shots. */
export interface FxLook {
  color?: string; // #rrggbb; undefined = each effect's own colors
  scale?: number; // size multiplier
  count?: number; // projectiles, for the styles in FX_COUNT
}

/** Styles that fire several projectiles: the player picks how many (default shown here). */
export const FX_COUNT: Partial<Record<FxStyle, { def: number; label: string }>> = {
  bullets: { def: 4, label: "Traçantes" },
  shotgun: { def: 7, label: "Chumbos" },
  missile: { def: 1, label: "Mísseis" },
};

/** Technical ceiling only (each projectile is several animated shapes on every screen). */
export const MAX_PROJECTILES = 50;

export type Vec = { x: number; y: number };
export type Cmd = ["M", number, number] | ["L", number, number] | ["Z"];

export interface Prim {
  id: string;
  cmds: Cmd[];
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

export interface FxPlan {
  duration: number; // seconds
  ids: string[]; // every shape id the animation may use
  at: (t: number) => Prim[];
}

// ------------------------------------------------------------------ geometry helpers

const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const lerp = (a: Vec, b: Vec, k: number): Vec => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const len = (a: Vec) => Math.hypot(a.x, a.y);
const norm = (a: Vec): Vec => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
const rot = (a: Vec, ang: number): Vec => ({ x: a.x * Math.cos(ang) - a.y * Math.sin(ang), y: a.x * Math.sin(ang) + a.y * Math.cos(ang) });
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const easeOut = (k: number) => 1 - Math.pow(1 - k, 2);

/** Filled quad around the segment p→q. */
function seg(p: Vec, q: Vec, w: number): Cmd[] {
  const n = rot(norm(sub(q, p)), Math.PI / 2);
  const a = add(p, mul(n, w / 2));
  const b = add(q, mul(n, w / 2));
  const c = add(q, mul(n, -w / 2));
  const d = add(p, mul(n, -w / 2));
  return [["M", a.x, a.y], ["L", b.x, b.y], ["L", c.x, c.y], ["L", d.x, d.y], ["Z"]];
}

/** Tapered streak (pointed tail at p, full width at q). */
function streak(p: Vec, q: Vec, w: number): Cmd[] {
  const n = rot(norm(sub(q, p)), Math.PI / 2);
  const b = add(q, mul(n, w / 2));
  const c = add(q, mul(n, -w / 2));
  return [["M", p.x, p.y], ["L", b.x, b.y], ["L", c.x, c.y], ["Z"]];
}

function circle(c: Vec, r: number, n = 18): Cmd[] {
  const out: Cmd[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([i ? "L" : "M", c.x + Math.cos(a) * r, c.y + Math.sin(a) * r]);
  }
  out.push(["Z"]);
  return out;
}

function diamond(c: Vec, r: number, ang: number): Cmd[] {
  const pts = [0, 1, 2, 3].map((i) => add(c, rot({ x: r, y: 0 }, ang + (i * Math.PI) / 2)));
  return [["M", pts[0].x, pts[0].y], ["L", pts[1].x, pts[1].y], ["L", pts[2].x, pts[2].y], ["L", pts[3].x, pts[3].y], ["Z"]];
}

/** Small deterministic random generator, so every player sees the same animation. */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Thin dark edge so bright projectiles still show on light maps. */
const OUTLINE = (dpi: number) => ({ stroke: "#2a1a08", strokeWidth: Math.max(1, dpi * 0.018), strokeOpacity: 0.9 });

// ------------------------------------------------------------------ plans

/**
 * @param from attacker token center, @param to target token center, @param dpi grid cell size,
 * @param hit whether the shot connects (a miss flies past the target), @param seed shared randomness,
 * @param look the attacker's chosen color / size (see lib/fxPrefs).
 */
export function planFx(style: FxStyle, from: Vec, to: Vec, dpi: number, hit: boolean, seed: number, look: FxLook = {}): FxPlan {
  const rnd = rng(seed);
  const u = norm(sub(to, from));
  const nrm = rot(u, Math.PI / 2);
  const side = rnd() < 0.5 ? -1 : 1;
  const start = add(from, mul(u, dpi * 0.45)); // muzzle: just outside the attacker's token
  // a miss passes beside the target and keeps going a bit
  const end = hit ? to : add(add(to, mul(nrm, side * dpi * 0.85)), mul(u, dpi * 1.1));
  const dist = Math.max(dpi, len(sub(end, start)));
  // player's look: one main color (light variant derived from it) and a size multiplier
  const sz = dpi * Math.max(0.5, Math.min(2.5, look.scale ?? 1));
  const color = look.color && /^#[0-9a-f]{6}$/i.test(look.color) ? look.color : undefined;
  const C = (def: string) => color ?? def;
  /** How many projectiles (for the styles that fire several), from the player's choice. */
  const countFor = (st: FxStyle) => {
    const r = FX_COUNT[st];
    if (!r) return 1;
    const n = Math.round(look.count ?? r.def);
    return Math.max(1, Math.min(MAX_PROJECTILES, Number.isFinite(n) ? n : r.def));
  };
  const L = (def: string) => (color ? shade(color, 0.55) : def);


  switch (style) {
    case "bullets":
      return projectiles(countFor("bullets"), 0.07, 0.11, 0.55, 0.075, C("#ffe08a"), 0.18);
    case "shotgun":
      return shotgun();
    case "cannon":
      return projectiles(1, 0, 0.0, 0.85, 0.17, C("#ffb347"), 0.35, true);
    case "beam":
      return beam();
    case "missile":
      return missile();
    case "flame":
      return flame();
    case "melee":
      return melee();
    case "tech":
      return tech();
  }

  /** Tracers fired one after another (spread = sideways jitter, in cells). */
  function projectiles(count: number, gap: number, spread: number, length: number, width: number, color: string, flash: number, heavy = false): FxPlan {
    const travel = Math.min(0.32, Math.max(0.12, dist / (dpi * (heavy ? 18 : 26))));
    const shots = Array.from({ length: count }, (_, i) => {
      const off = mul(nrm, (rnd() - 0.5) * 2 * spread * dpi);
      return { delay: i * gap, end: add(end, off) };
    });
    const impact = heavy ? 0.4 : 0.22;
    const duration = shots[shots.length - 1].delay + travel + impact;
    const ids = shots.flatMap((_, i) => [`m${i}`, `p${i}`, `i${i}`, `r${i}`]);
    return {
      duration,
      ids,
      at(t) {
        const out: Prim[] = [];
        shots.forEach((s, i) => {
          const k = (t - s.delay) / travel;
          // muzzle flash
          const fk = (t - s.delay) / 0.09;
          if (fk >= 0 && fk <= 1) out.push({ id: `m${i}`, cmds: circle(start, sz * flash * (0.6 + 0.4 * fk)), fill: L("#fff6c8"), fillOpacity: 1 - fk });
          if (k >= 0 && k <= 1) {
            // the tail leaves from the muzzle (not the head), so a bigger tracer doesn't start inside the token
            const dir = norm(sub(s.end, start));
            const head = lerp(add(start, mul(dir, sz * length)), s.end, k);
            const tail = add(head, mul(dir, -sz * length));
            out.push({ id: `p${i}`, cmds: streak(tail, head, sz * width), fill: color, fillOpacity: 1, ...OUTLINE(sz) });
          }
          // impact
          const ik = (t - s.delay - travel) / impact;
          if (hit && ik >= 0 && ik <= 1) {
            out.push({ id: `i${i}`, cmds: circle(s.end, sz * (heavy ? 0.75 : 0.28) * easeOut(ik)), fill: heavy ? C("#ff9b3d") : L("#fff2b0"), fillOpacity: 1 - ik });
            if (heavy)
              out.push({ id: `r${i}`, cmds: circle(s.end, sz * (0.3 + 0.9 * easeOut(ik))), stroke: L("#ffd08a"), strokeWidth: sz * 0.07, strokeOpacity: 1 - ik, fillOpacity: 0 });
          }
        });
        return out;
      },
    };
  }

  function shotgun(): FxPlan {
    const travel = Math.min(0.26, Math.max(0.1, dist / (dpi * 28)));
    const pellets = Array.from({ length: countFor("shotgun") }, () => {
      const ang = (rnd() - 0.5) * 0.35; // ~±10°
      const reach = dist * (0.92 + rnd() * 0.12);
      return add(start, mul(rot(norm(sub(end, start)), ang), reach));
    });
    const duration = travel + 0.25;
    return {
      duration,
      ids: ["m", ...pellets.flatMap((_, i) => [`p${i}`, `i${i}`])],
      at(t) {
        const out: Prim[] = [];
        const fk = t / 0.1;
        if (fk <= 1) out.push({ id: "m", cmds: circle(start, sz * 0.32 * (0.6 + 0.4 * fk)), fill: L("#fff1b8"), fillOpacity: 1 - fk });
        pellets.forEach((p, i) => {
          const k = t / travel;
          if (k <= 1) {
            const dir = norm(sub(p, start));
            const head = lerp(add(start, mul(dir, sz * 0.28)), p, k); // tail starts at the muzzle
            out.push({ id: `p${i}`, cmds: streak(add(head, mul(dir, -sz * 0.28)), head, sz * 0.06), fill: C("#ffe7a0"), fillOpacity: 1, ...OUTLINE(sz) });
          }
          const ik = (t - travel) / 0.25;
          if (hit && ik >= 0 && ik <= 1) out.push({ id: `i${i}`, cmds: circle(p, sz * 0.14 * easeOut(ik)), fill: L("#fff2b0"), fillOpacity: 1 - ik });
        });
        return out;
      },
    };
  }

  function beam(): FxPlan {
    const duration = 0.75;
    return {
      duration,
      ids: ["charge", "outer", "core", "glow"],
      at(t) {
        const out: Prim[] = [];
        if (t < 0.15) out.push({ id: "charge", cmds: circle(start, sz * (0.08 + 1.4 * t)), fill: L("#bfeaff"), fillOpacity: 0.9 });
        if (t >= 0.12) {
          const fade = t > 0.5 ? 1 - (t - 0.5) / 0.25 : 1;
          const grow = clamp01((t - 0.12) / 0.06);
          const flicker = 1 + 0.18 * Math.sin(t * 70);
          const head = lerp(start, end, grow);
          out.push({ id: "outer", cmds: seg(start, head, sz * 0.24 * flicker), fill: C("#45b8ff"), fillOpacity: 0.55 * fade });
          out.push({ id: "core", cmds: seg(start, head, sz * 0.07), fill: "#ffffff", fillOpacity: 0.95 * fade });
          if (hit && grow >= 1) out.push({ id: "glow", cmds: circle(end, sz * 0.38 * flicker), fill: L("#9fe0ff"), fillOpacity: 0.7 * fade });
        }
        return out;
      },
    };
  }

  /** One missile, or a salvo: each flies its own arc and explodes around the target. */
  function missile(): FxPlan {
    const n = countFor("missile");
    const travel = Math.min(0.75, Math.max(0.35, dist / (dpi * 9)));
    const trail = n > 3 ? 2 : 4; // shorter smoke trails for big salvos
    const salvo = Array.from({ length: n }, (_, m) => {
      const s = n === 1 ? side : m % 2 ? 1 : -1;
      const lift = Math.min(dist * 0.25, sz * 1.3) * s * (n === 1 ? 1 : 0.6 + rnd() * 0.8);
      // the impacts spread a little around the target in a salvo
      const at = n === 1 ? end : add(end, add(mul(nrm, (rnd() - 0.5) * sz * 1.1), mul(u, (rnd() - 0.5) * sz * 0.8)));
      return { delay: m * 0.09, lift, at };
    });
    const boom = hit ? 0.5 : 0.4;
    const ids = salvo.flatMap((_, m) => [
      ...Array.from({ length: trail }, (_, j) => `s${m}_${j}`),
      `body${m}`,
      `fire${m}`,
      `core${m}`,
      `ring${m}`,
    ]);
    return {
      duration: salvo[n - 1].delay + travel + boom,
      ids,
      at(t) {
        const out: Prim[] = [];
        salvo.forEach((ms, m) => {
          const pos = (k: number) => add(lerp(start, ms.at, k), mul(nrm, Math.sin(Math.PI * k) * ms.lift));
          const k = (t - ms.delay) / travel;
          if (k >= 0 && k <= 1) {
            for (let j = trail - 1; j >= 0; j--) {
              const kj = k - (j + 1) * 0.07;
              if (kj > 0) out.push({ id: `s${m}_${j}`, cmds: circle(pos(kj), sz * (0.09 + 0.05 * j)), fill: "#c8c8c8", fillOpacity: 0.55 - 0.12 * j });
            }
            out.push({ id: `body${m}`, cmds: circle(pos(k), sz * 0.12), fill: C("#ff9b3d"), fillOpacity: 1, ...OUTLINE(sz) });
          }
          const bk = (t - ms.delay - travel) / boom;
          if (bk >= 0 && bk <= 1) {
            // a salvo's explosions are a bit smaller each
            const size = (hit ? 1 : 0.6) * (n === 1 ? 1 : 0.75);
            out.push({ id: `fire${m}`, cmds: circle(ms.at, sz * 0.95 * size * easeOut(bk)), fill: C("#ff7b29"), fillOpacity: 0.9 * (1 - bk) });
            out.push({ id: `core${m}`, cmds: circle(ms.at, sz * 0.5 * size * easeOut(Math.min(1, bk * 1.6))), fill: L("#ffe27a"), fillOpacity: 1 - bk });
            out.push({ id: `ring${m}`, cmds: circle(ms.at, sz * (0.2 + 1.3 * size * easeOut(bk))), stroke: L("#ffc28a"), strokeWidth: sz * 0.06, strokeOpacity: 1 - bk, fillOpacity: 0 });
          }
        });
        return out;
      },
    };
  }

  function flame(): FxPlan {
    const parts = Array.from({ length: 12 }, (_, i) => ({ delay: i * 0.035, ang: (rnd() - 0.5) * 0.4, reach: 0.85 + rnd() * 0.2 }));
    const life = 0.38;
    return {
      duration: parts[parts.length - 1].delay + life,
      ids: parts.map((_, i) => `f${i}`),
      at(t) {
        const out: Prim[] = [];
        parts.forEach((p, i) => {
          const k = (t - p.delay) / life;
          if (k < 0 || k > 1) return;
          const dir = rot(norm(sub(end, start)), p.ang * k);
          const c = add(start, mul(dir, dist * p.reach * easeOut(k)));
          out.push({ id: `f${i}`, cmds: circle(c, sz * (0.1 + 0.32 * k)), fill: k < 0.45 ? L("#ffd36b") : C("#ff4d1a"), fillOpacity: 0.85 * (1 - k) });
        });
        return out;
      },
    };
  }

  function melee(): FxPlan {
    // slashes across the target (or beside it on a miss)
    const center = hit ? to : add(to, mul(nrm, side * dpi * 0.75));
    const slashes = [0, 1, 2].map((i) => {
      const ang = (rnd() - 0.5) * 1.2 + (i % 2 ? Math.PI / 2 : 0) + Math.atan2(u.y, u.x);
      const d = rot({ x: sz * 0.55, y: 0 }, ang);
      return { delay: i * 0.12, a: sub(center, d), b: add(center, d) };
    });
    const life = 0.24;
    return {
      duration: slashes[2].delay + life + 0.1,
      ids: ["flash", ...slashes.flatMap((_, i) => [`o${i}`, `s${i}`])],
      at(t) {
        const out: Prim[] = [];
        slashes.forEach((s, i) => {
          const k = (t - s.delay) / life;
          if (k < 0 || k > 1) return;
          const head = lerp(s.a, s.b, easeOut(Math.min(1, k * 2)));
          const fade = k > 0.5 ? 1 - (k - 0.5) * 2 : 1;
          out.push({ id: `o${i}`, cmds: streak(s.a, head, sz * 0.16), fill: C("#ff5a4a"), fillOpacity: 0.7 * fade });
          out.push({ id: `s${i}`, cmds: streak(s.a, head, sz * 0.07), fill: "#ffffff", fillOpacity: fade });
        });
        const fk = (t - 0.05) / 0.3;
        if (hit && fk >= 0 && fk <= 1) out.push({ id: "flash", cmds: circle(center, sz * 0.5 * easeOut(fk)), fill: L("#fff2e0"), fillOpacity: 0.5 * (1 - fk) });
        return out;
      },
    };
  }

  function tech(): FxPlan {
    const packets = [0, 1, 2, 3, 4].map((i) => i * 0.06);
    const travel = 0.32;
    return {
      duration: 1.0,
      ids: ["src", ...packets.map((_, i) => `d${i}`), "r0", "r1", "glow"],
      at(t) {
        const out: Prim[] = [];
        const sk = t / 0.3;
        if (sk <= 1) out.push({ id: "src", cmds: circle(from, sz * (0.3 + 0.5 * sk)), stroke: C("#c58bff"), strokeWidth: sz * 0.05, strokeOpacity: 1 - sk, fillOpacity: 0 });
        packets.forEach((d, i) => {
          const k = (t - 0.12 - d) / travel;
          if (k < 0 || k > 1) return;
          out.push({ id: `d${i}`, cmds: diamond(lerp(start, end, k), sz * 0.1, t * 9), fill: L("#e2c6ff"), fillOpacity: 0.95 });
        });
        [0, 1].forEach((j) => {
          const k = (t - 0.5 - j * 0.12) / 0.38;
          if (k < 0 || k > 1) return;
          out.push({ id: `r${j}`, cmds: circle(end, sz * (1.05 - 0.8 * k)), stroke: C("#b77bff"), strokeWidth: sz * 0.06, strokeOpacity: (hit ? 1 : 0.4) * (1 - k * 0.6), fillOpacity: 0 });
        });
        const gk = (t - 0.7) / 0.3;
        if (hit && gk >= 0 && gk <= 1) out.push({ id: "glow", cmds: circle(end, sz * 0.4), fill: C("#c58bff"), fillOpacity: 0.45 * (1 - gk) });
        return out;
      },
    };
  }
}
