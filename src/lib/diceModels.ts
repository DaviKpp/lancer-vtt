// Dice look: chamfered polyhedra, PBR materials with procedural textures and engraved numbers.
// (Style inspired by the Owlbear Rodeo dice; everything here is generated in code.)
import * as THREE from "three";
import type { DieTone } from "./diceShow";
import { isLight, shade, type DiceSet } from "./diceSets";

export interface DieFace {
  normal: THREE.Vector3;
  center: THREE.Vector3;
  label: number;
  /** Side of the square the face's number is drawn in. */
  labelSize: number;
}

export interface DieModel {
  geometry: THREE.BufferGeometry;
  faces: DieFace[];
}

// ------------------------------------------------------------------ geometry

function basePolyhedron(sides: number): THREE.BufferGeometry {
  switch (sides) {
    case 4:
      return new THREE.TetrahedronGeometry(1);
    case 3:
    case 6:
      return new THREE.BoxGeometry(1.15, 1.15, 1.15).toNonIndexed();
    case 8:
      return new THREE.OctahedronGeometry(0.95);
    case 12:
      return new THREE.DodecahedronGeometry(0.92);
    default:
      return new THREE.IcosahedronGeometry(0.95);
  }
}

/** Unique vertices + polygon faces (vertex indices ordered around the face normal). */
function polygonsOf(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute("position");
  const verts: THREE.Vector3[] = [];
  const indexOf = (v: THREE.Vector3) => {
    const i = verts.findIndex((u) => u.distanceToSquared(v) < 1e-8);
    if (i >= 0) return i;
    verts.push(v.clone());
    return verts.length - 1;
  };
  const faces: { normal: THREE.Vector3; ids: Set<number> }[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (n.dot(a) < 0) n.negate();
    let f = faces.find((x) => x.normal.dot(n) > 0.999);
    if (!f) faces.push((f = { normal: n, ids: new Set() }));
    [a, b, c].forEach((v) => f!.ids.add(indexOf(v)));
  }
  return {
    verts,
    faces: faces.map((f) => {
      const ids = [...f.ids];
      const center = ids.reduce((s, i) => s.add(verts[i]), new THREE.Vector3()).divideScalar(ids.length);
      // order around the normal
      const t1 = new THREE.Vector3().subVectors(verts[ids[0]], center).normalize();
      const t2 = new THREE.Vector3().crossVectors(f.normal, t1);
      ids.sort((i, j) => {
        const di = new THREE.Vector3().subVectors(verts[i], center);
        const dj = new THREE.Vector3().subVectors(verts[j], center);
        return Math.atan2(di.dot(t2), di.dot(t1)) - Math.atan2(dj.dot(t2), dj.dot(t1));
      });
      return { normal: f.normal, center, ids };
    }),
  };
}

/** Face numbers: opposite faces add up to sides + 1, like real dice (a d3 is a d6 numbered 1–3 twice). */
function assignLabels(normals: THREE.Vector3[], sides: number): number[] {
  const n = normals.length;
  const labels = new Array<number>(n).fill(0);
  const pairs: [number, number][] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (used.has(i)) continue;
    const j = normals.findIndex((m, k) => k !== i && !used.has(k) && m.dot(normals[i]) < -0.999);
    if (j < 0) break;
    used.add(i).add(j);
    pairs.push([i, j]);
  }
  if (pairs.length * 2 === n) {
    pairs.forEach(([i, j], p) => {
      labels[i] = p + 1;
      labels[j] = n - p;
    });
  } else {
    for (let i = 0; i < n; i++) labels[i] = i + 1; // d4: no opposite faces
  }
  return sides === 3 ? labels.map((l) => Math.ceil(l / 2)) : labels;
}

/**
 * Chamfered die: every face is shrunk towards its center; the gaps become bevel strips along the
 * edges and small caps at the corners, with smoothed normals so the edges look rounded.
 */
export function buildDieModel(sides: number): DieModel {
  const { verts, faces } = polygonsOf(basePolyhedron(sides));
  const k = sides === 4 ? 0.9 : sides === 6 || sides === 3 ? 0.9 : 0.93;
  const shrunk = faces.map((f) => f.ids.map((id) => verts[id].clone().sub(f.center).multiplyScalar(k).add(f.center)));

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const tri = (pa: THREE.Vector3, pb: THREE.Vector3, pc: THREE.Vector3, na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3) => {
    // keep the winding outward
    const n = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa));
    const centroid = new THREE.Vector3().add(pa).add(pb).add(pc);
    if (n.dot(centroid) < 0) {
      [pb, pc] = [pc, pb];
      [nb, nc] = [nc, nb];
    }
    // planar UVs on the triangle's own plane (textures are noise, seams don't show)
    const nn = n.lengthSq() > 0 ? n.clone().normalize() : na;
    const t1 = new THREE.Vector3(nn.y, nn.z, nn.x).cross(nn).normalize();
    const t2 = new THREE.Vector3().crossVectors(nn, t1);
    for (const [p, q] of [
      [pa, na],
      [pb, nb],
      [pc, nc],
    ] as const) {
      positions.push(p.x, p.y, p.z);
      normals.push(q.x, q.y, q.z);
      uvs.push(p.dot(t1) * 0.6 + 0.5, p.dot(t2) * 0.6 + 0.5);
    }
  };

  // faces
  faces.forEach((f, fi) => {
    const ring = shrunk[fi];
    for (let i = 1; i < ring.length - 1; i++) tri(ring[0], ring[i], ring[i + 1], f.normal, f.normal, f.normal);
  });

  // bevel strips: one per edge shared by two faces
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    for (let i = 0; i < f.ids.length; i++) {
      const va = f.ids[i];
      const vb = f.ids[(i + 1) % f.ids.length];
      const gi = faces.findIndex((g, gj) => gj > fi && g.ids.includes(va) && g.ids.includes(vb));
      if (gi < 0) continue;
      const g = faces[gi];
      const fa = shrunk[fi][i];
      const fb = shrunk[fi][(i + 1) % f.ids.length];
      const ga = shrunk[gi][g.ids.indexOf(va)];
      const gb = shrunk[gi][g.ids.indexOf(vb)];
      tri(fa, fb, gb, f.normal, f.normal, g.normal);
      tri(fa, gb, ga, f.normal, g.normal, g.normal);
    }
  }

  // corner caps: one small polygon per original vertex
  verts.forEach((v, vi) => {
    const around = faces
      .map((f, fi) => ({ f, p: shrunk[fi][f.ids.indexOf(vi)] }))
      .filter((x) => x.f.ids.includes(vi));
    if (around.length < 3) return;
    const dir = v.clone().normalize();
    const t1 = new THREE.Vector3().subVectors(around[0].p, v).projectOnPlane(dir).normalize();
    const t2 = new THREE.Vector3().crossVectors(dir, t1);
    around.sort((x, y) => {
      const dx = new THREE.Vector3().subVectors(x.p, v);
      const dy = new THREE.Vector3().subVectors(y.p, v);
      return Math.atan2(dx.dot(t2), dx.dot(t1)) - Math.atan2(dy.dot(t2), dy.dot(t1));
    });
    for (let i = 1; i < around.length - 1; i++)
      tri(around[0].p, around[i].p, around[i + 1].p, around[0].f.normal, around[i].f.normal, around[i + 1].f.normal);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  const labels = assignLabels(
    faces.map((f) => f.normal),
    sides,
  );
  return {
    geometry,
    faces: faces.map((f, fi) => {
      // biggest square that fits: ~1.25 × the shrunk face's inradius
      const ring = shrunk[fi];
      let inr = Infinity;
      for (let i = 0; i < ring.length; i++) {
        const line = new THREE.Line3(ring[i], ring[(i + 1) % ring.length]);
        inr = Math.min(inr, line.closestPointToPoint(f.center, true, new THREE.Vector3()).distanceTo(f.center));
      }
      return { normal: f.normal, center: f.center, label: labels[fi], labelSize: inr * (ring.length === 3 ? 1.6 : 1.6) };
    }),
  };
}

// ------------------------------------------------------------------ materials

type Painter = (g: CanvasRenderingContext2D, s: number, rnd: () => number) => void;

function canvasTexture(paint: Painter, seed: number): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  let x = seed;
  const rnd = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
  paint(g, s, rnd);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const clouds =
  (base: string, blobs: string[], count = 70): Painter =>
  (g, s, rnd) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < count; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = s * (0.08 + rnd() * 0.25);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, blobs[Math.floor(rnd() * blobs.length)]);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      // draw wrapped so the texture tiles
      for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
    }
  };

const sparkles =
  (count: number, color = "rgba(255,255,255,0.9)"): Painter =>
  (g, s, rnd) => {
    g.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const r = rnd() < 0.9 ? 0.6 + rnd() * 0.8 : 1.6 + rnd();
      g.globalAlpha = 0.4 + rnd() * 0.6;
      g.beginPath();
      g.arc(rnd() * s, rnd() * s, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  };

const brushed =
  (base: string): Painter =>
  (g, s, rnd) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = Math.floor(rnd() * 70) + 150;
      g.strokeStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.1})`;
      const y = rnd() * s;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(s, y + (rnd() - 0.5) * 4);
      g.stroke();
    }
  };

const both =
  (...ps: Painter[]): Painter =>
  (g, s, rnd) =>
    ps.forEach((p) => p(g, s, rnd));

export interface DieStyle {
  body: () => THREE.MeshPhysicalMaterial;
  ink: string;
  inkShadow: string;
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A player's dice set (material + colors) as a die style. */
export function styleFromSet(set: DiceSet): DieStyle {
  const seed = parseInt(set.body.slice(1), 16) % 1000;
  const dark = shade(set.body, -0.5);
  const body = (): THREE.MeshPhysicalMaterial => {
    switch (set.material) {
      case "gema":
        return new THREE.MeshPhysicalMaterial({
          // "gem": glossy with an inner glow (real transmission renders unreliably on a transparent canvas)
          map: canvasTexture(clouds(set.body, [rgba(set.accent, 0.35), rgba(dark, 0.5)], 40), seed),
          emissive: new THREE.Color(shade(set.body, -0.3)),
          emissiveIntensity: 0.6,
          roughness: 0.1,
          clearcoat: 1,
          clearcoatRoughness: 0.4,
        });
      case "metal":
        return new THREE.MeshPhysicalMaterial({
          map: canvasTexture(brushed(set.body), seed),
          metalness: 0.9,
          roughness: 0.45,
        });
      case "nebulosa":
        return new THREE.MeshPhysicalMaterial({
          map: canvasTexture(
            both(clouds(set.body, [rgba(set.accent, 0.55), rgba(shade(set.accent, 0.35), 0.35), rgba(dark, 0.5)]), sparkles(140)),
            seed,
          ),
          roughness: 0.3,
          clearcoat: 1,
          clearcoatRoughness: 0.4,
        });
      case "pedra":
        return new THREE.MeshPhysicalMaterial({
          map: canvasTexture(both(clouds(set.body, [rgba(set.accent, 0.6), rgba(dark, 0.7)]), sparkles(260)), seed),
          roughness: 0.45,
          clearcoat: 0.6,
          clearcoatRoughness: 0.3,
        });
      default:
        return new THREE.MeshPhysicalMaterial({
          map: canvasTexture(clouds(set.body, [rgba(set.accent, 0.8), rgba(shade(set.accent, 0.3), 0.5), rgba(dark, 0.8)]), seed),
          roughness: 0.4,
          clearcoat: 0.8,
          clearcoatRoughness: 0.4,
        });
    }
  };
  return { body, ink: set.ink, inkShadow: isLight(set.ink) ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.5)" };
}

/** Accuracy and difficulty dice are always these colors (players can't change them). */
export const ACC_COLOR = "#ffffff";
export const DIFF_COLOR = "#a80309";

/** One style per kind of die. */
export const STYLES: Record<DieTone, DieStyle> = {
  // d20: red/orange "sunset" with a glossy coat
  main: {
    body: () =>
      new THREE.MeshPhysicalMaterial({
        map: canvasTexture(clouds("#8e1414", ["rgba(226,56,44,0.9)", "rgba(255,120,40,0.6)", "rgba(90,0,10,0.8)"]), 11),
        roughness: 0.4,
        clearcoat: 0.8,
        clearcoatRoughness: 0.4,
      }),
    ink: "#ffffff",
    inkShadow: "rgba(40,0,0,0.9)",
  },
  // accuracy: always solid white with red numbers
  acc: {
    body: () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(ACC_COLOR), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.35 }),
    ink: "#a80309",
    inkShadow: "rgba(0,0,0,0.35)",
  },
  // difficulty: always solid red (#a80309) with black numbers
  diff: {
    body: () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(DIFF_COLOR), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.35 }),
    ink: "#000000",
    inkShadow: "rgba(255,170,170,0.55)",
  },
  // damage: dark speckled "galaxy" stone, like the default Owlbear set
  dmg: {
    body: () =>
      new THREE.MeshPhysicalMaterial({
        map: canvasTexture(both(clouds("#2a2d36", ["rgba(70,76,92,0.6)", "rgba(15,16,22,0.7)"]), sparkles(260)), 51),
        roughness: 0.45,
        clearcoat: 0.6,
        clearcoatRoughness: 0.3,
      }),
    ink: "#ffffff",
    inkShadow: "rgba(0,0,0,0.95)",
  },
  // structure / stress checks: brushed brass
  check: {
    body: () =>
      new THREE.MeshPhysicalMaterial({
        map: canvasTexture(brushed("#8a6418"), 67),
        metalness: 0.9,
        roughness: 0.5,
      }),
    ink: "#2a1d05",
    inkShadow: "rgba(255,230,160,0.6)",
  },
};

const numberCache = new Map<string, THREE.Texture>();

/** Engraved-looking number: a darker offset "groove" under the ink. */
export function numberTexture(n: number, style: DieStyle): THREE.Texture {
  const key = `${n}|${style.ink}|${style.inkShadow}`;
  const hit = numberCache.get(key);
  if (hit) return hit;
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  g.font = `700 ${n >= 10 ? 80 : 100}px "Roboto", "Segoe UI", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const y = s / 2 + 3;
  g.fillStyle = style.inkShadow;
  g.filter = "blur(1.5px)";
  g.fillText(String(n), s / 2 + 3, y + 3);
  g.filter = "none";
  g.fillStyle = style.ink;
  g.fillText(String(n), s / 2, y);
  if (n === 6 || n === 9) g.fillRect(s * 0.34, s * 0.88, s * 0.32, s * 0.05);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  numberCache.set(key, tex);
  return tex;
}
