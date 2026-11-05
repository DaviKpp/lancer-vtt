// 3D dice thrown across the screen (popover opened on every player's screen by the background page).
// The results are already decided by the roll; each die tumbles and settles with that face up.
import OBR from "@owlbear-rodeo/sdk";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { DiceShow, ShownDie } from "./lib/diceShow";
import { buildDieModel, numberTexture, STYLES, styleFromSet, type DieStyle } from "./lib/diceModels";
import { sanitizeSet } from "./lib/diceSets";
import { DICE_POPOVER_ID } from "./obr/dice";

const show: DiceShow | null = (() => {
  try {
    return JSON.parse(decodeURIComponent(location.hash.slice(1)));
  } catch {
    return null;
  }
})();

const ROLL_TIME = 1.6; // seconds until the dice stop
const HOLD_TIME = 3.2; // seconds the result stays on screen

// ------------------------------------------------------------------ scene

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
// soft studio reflections for the glossy / metal dice
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
// Tilt the studio lights away from straight overhead: the result faces lie flat and would mirror them as white glare.
scene.environmentRotation.set(1.1, 0.6, 0);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0, 16, 1.2);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-4, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
scene.add(sun);

// invisible table that only receives the dice shadows
const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.35 }));
table.rotation.x = -Math.PI / 2;
table.receiveShadow = true;
scene.add(table);

let halfW = 6; // visible half-width / half-depth of the table, updated on resize
let halfD = 3.5;
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  const dist = camera.position.length();
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
  halfW = half * camera.aspect * 0.8;
  halfD = half * 0.72; // leave room for the caption at the bottom
}
window.addEventListener("resize", resize);
resize();

// The roller's own colors apply to their d20 and damage dice.
const playerSet = sanitizeSet(show?.set);
const playerStyle: DieStyle | undefined = playerSet ? styleFromSet(playerSet) : undefined;

interface Die {
  mesh: THREE.Mesh;
  body: THREE.MeshPhysicalMaterial;
  decals: THREE.MeshStandardMaterial[];
  radius: number; // rest height (center → face on the table), unscaled
  hit: number; // collision radius (bounding sphere), unscaled
  scale: number;
  final: THREE.Quaternion;
  spinAxis: THREE.Vector3;
  spinTurns: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  delay: number;
  bounce: number;
  kept: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);

function makeDie(d: ShownDie): Die {
  const model = buildDieModel(d.sides);
  const style = (d.tone === "main" || d.tone === "dmg") && playerStyle ? playerStyle : STYLES[d.tone];
  const body = style.body();
  body.transparent = !d.kept; // only the dice that fade need blending
  const mesh = new THREE.Mesh(model.geometry, body);
  mesh.castShadow = true;
  model.geometry.computeBoundingSphere();
  const hit = model.geometry.boundingSphere?.radius ?? 1;

  const faces = model.faces;
  const decals: THREE.MeshStandardMaterial[] = [];
  for (const f of faces) {
    const mat = new THREE.MeshStandardMaterial({
      map: numberTexture(f.label, style),
      transparent: true,
      depthWrite: false,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    decals.push(mat);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(f.labelSize, f.labelSize), mat);
    plane.position.copy(f.center).addScaledVector(f.normal, 0.003);
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.normal);
    mesh.add(plane);
  }
  const labels = faces.map((f) => f.label);

  // Final orientation: the rolled face lies flat, pointing straight up, with its number upright on screen
  // (screen "up" is world -Z).
  const faceIdx = Math.max(0, labels.findIndex((l) => l === d.value));
  const final = new THREE.Quaternion().setFromUnitVectors(faces[faceIdx].normal, UP);
  const decalUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), faces[faceIdx].normal))
    .applyQuaternion(final);
  const twist = Math.atan2(decalUp.x, -decalUp.z);
  final.premultiply(new THREE.Quaternion().setFromAxisAngle(UP, twist));

  // Rest height: distance from the center to the face lying on the table.
  const radius = faces[0].center.length();

  return {
    mesh,
    body,
    decals,
    radius,
    hit,
    scale: 1,
    final,
    spinAxis: new THREE.Vector3(0, 0, 1),
    spinTurns: 2.5 + Math.random() * 2,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    delay: 0,
    bounce: 1.2 + Math.random() * 0.8,
    kept: d.kept,
  };
}

// ------------------------------------------------------------------ animation

/**
 * Final spots in a grid where no two dice touch (shrinking all of them if the grid doesn't fit),
 * thrown in from the left: the dice going farthest leave first, each in its own lane.
 */
function layout(list: Die[]) {
  const n = list.length;
  if (!n) return;
  const maxHit = Math.max(...list.map((d) => d.hit));
  const cell = maxHit * 2 * 1.08;
  let cols = Math.max(1, Math.min(n, Math.floor((halfW * 2) / cell)));
  let rows = Math.ceil(n / cols);
  // too many rows for the height: use more columns and shrink the dice to fit
  while (rows * cell > halfD * 2 && cols < n) rows = Math.ceil(n / ++cols);
  const scale = Math.min(1, (halfW * 2) / (cols * cell), (halfD * 2) / (rows * cell));
  const step = cell * scale;
  list.forEach((d, i) => {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const col = i - row * cols;
    d.scale = scale;
    d.mesh.scale.setScalar(scale);
    const jitter = (step - maxHit * 2 * scale) / 2; // free space left in the cell
    d.to.set(
      (col - (inRow - 1) / 2) * step + (Math.random() - 0.5) * jitter,
      d.radius * scale,
      (row - (rows - 1) / 2) * step + (Math.random() - 0.5) * jitter,
    );
    d.from.set(-halfW - 2.5 - (cols - 1 - col) * step * 0.5, 3 + Math.random() * 1.5, d.to.z);
    d.delay = (cols - 1 - col) * 0.06 + row * 0.03;
    const dir = new THREE.Vector3().subVectors(d.to, d.from).setY(0).normalize();
    d.spinAxis.crossVectors(UP, dir).normalize(); // rolls forward along the throw
  });
}

const dice: Die[] = (show?.dice ?? []).map((d) => makeDie(d));
layout(dice);
dice.forEach((d) => scene.add(d.mesh));
const lastDelay = Math.max(0, ...dice.map((d) => d.delay));

const caption = document.getElementById("caption")!;
if (show) {
  (caption.querySelector(".who") as HTMLElement).textContent = `${show.title} · ${show.label}`;
  (caption.querySelector(".result") as HTMLElement).textContent = show.result || "";
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const tmpQ = new THREE.Quaternion();
let start = -1;
let captionShown = false;
// The caption is for the roller only; outside Owlbear (preview) it always shows.
let captionAllowed = window.parent === window;

function place(d: Die, t: number) {
  const local = Math.max(0, Math.min(1, (t - d.delay) / ROLL_TIME));
  const e = easeOut(local);
  d.mesh.position.lerpVectors(d.from, d.to, e);
  // falling + a couple of decaying bounces
  const hop = Math.abs(Math.cos(local * Math.PI * 2.5)) * Math.pow(1 - local, 2) * d.bounce * 2.2;
  d.mesh.position.y = (d.radius + hop) * d.scale;
  // tumbling: spin that unwinds exactly into the final orientation
  const angle = d.spinTurns * Math.PI * 2 * Math.pow(1 - local, 2);
  tmpQ.setFromAxisAngle(d.spinAxis, -angle);
  d.mesh.quaternion.copy(d.final).premultiply(tmpQ);
  // dice that don't count fade a bit once they settle
  if (!d.kept && local >= 1) {
    const fade = Math.max(0.35, 1 - (t - d.delay - ROLL_TIME) * 1.5);
    d.body.opacity = fade;
    d.decals.forEach((m) => (m.opacity = fade));
  }
}

/** Pushes apart (sideways) dice that would overlap mid-throw. The final spots never overlap, so the landing is exact. */
const push = new THREE.Vector3();
function separate() {
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < dice.length; i++) {
      for (let j = i + 1; j < dice.length; j++) {
        const a = dice[i].mesh.position;
        const b = dice[j].mesh.position;
        const min = (dice[i].hit * dice[i].scale + dice[j].hit * dice[j].scale) * 1.02;
        push.subVectors(b, a);
        const dist = push.length();
        if (dist >= min) continue;
        push.y = 0;
        if (push.lengthSq() < 1e-6) push.set(0, 0, 1);
        push.normalize().multiplyScalar((min - dist) / 2);
        a.sub(push);
        b.add(push);
      }
    }
  }
}

function frame(now: number) {
  if (start < 0) start = now;
  const t = (now - start) / 1000;
  dice.forEach((d) => place(d, t));
  separate();
  renderer.render(scene, camera);
  const settled = t > ROLL_TIME + lastDelay;
  if (settled && !captionShown && captionAllowed) {
    captionShown = true;
    caption.classList.add("show");
  }
  if (t < ROLL_TIME + HOLD_TIME + lastDelay) requestAnimationFrame(frame);
  else close();
}

function close() {
  void OBR.popover.close(DICE_POPOVER_ID);
}

// Opened directly (outside Owlbear, e.g. to preview): just play the throw once.
if (window.parent === window) requestAnimationFrame(frame);

OBR.onReady(() => {
  captionAllowed = !show?.byId || show.byId === OBR.player.id;
  document.body.addEventListener("click", close);
  if (!dice.length) close();
  else requestAnimationFrame(frame);
});
