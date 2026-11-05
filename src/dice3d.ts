// 3D dice thrown across the screen (popover opened on every player's screen by the background page).
// The results are already decided by the roll; each die tumbles and settles with that face up.
import OBR from "@owlbear-rodeo/sdk";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { DiceShow, ShownDie } from "./lib/diceShow";
import { buildDieModel, numberTexture, STYLES } from "./lib/diceModels";
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
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0, 16, 2.6);
camera.lookAt(0, 0, 0.2);
// The rolled face points at the camera (not straight up), so it's the one that reads as "on top".
const VIEW = camera.position.clone().normalize();
const CAM_UP = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

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

let halfW = 6; // visible half-width of the table, updated on resize
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  const dist = camera.position.length();
  halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist * camera.aspect * 0.8;
}
window.addEventListener("resize", resize);
resize();

interface Die {
  mesh: THREE.Mesh;
  body: THREE.MeshPhysicalMaterial;
  decals: THREE.MeshStandardMaterial[];
  radius: number;
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

function makeDie(d: ShownDie, index: number, count: number): Die {
  const model = buildDieModel(d.sides);
  const style = STYLES[d.tone];
  const body = style.body();
  body.transparent = !d.kept; // only the dice that fade need blending
  const mesh = new THREE.Mesh(model.geometry, body);
  mesh.castShadow = true;

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

  // Final orientation: the face with the rolled value looks up, with a random spin around the vertical.
  const faceIdx = Math.max(0, labels.findIndex((l) => l === d.value));
  const final = new THREE.Quaternion().setFromUnitVectors(faces[faceIdx].normal, VIEW);
  // Turn it around the view axis so the number reads upright on screen, give or take a little.
  const decalUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), faces[faceIdx].normal))
    .applyQuaternion(final);
  const twist =
    Math.atan2(new THREE.Vector3().crossVectors(decalUp, CAM_UP).dot(VIEW), decalUp.dot(CAM_UP)) + (Math.random() - 0.5) * 0.5;
  final.premultiply(new THREE.Quaternion().setFromAxisAngle(VIEW, twist));
  // A slight random tilt so the sides show (a die never lands perfectly square to the camera).
  const tiltAxis = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).cross(VIEW).normalize();
  final.premultiply(new THREE.Quaternion().setFromAxisAngle(tiltAxis, 0.18 + Math.random() * 0.12));

  // Rest height: distance from the center to the face lying on the table.
  const radius = faces[0].center.length();

  // Thrown in from the left, landing in a row in the middle of the screen.
  const spacing = Math.min(2, (halfW * 1.6) / Math.max(1, count));
  const to = new THREE.Vector3((index - (count - 1) / 2) * spacing, radius, (Math.random() - 0.5) * 1.2);
  const from = new THREE.Vector3(-halfW - 2 - Math.random() * 2, 3 + Math.random() * 2, to.z + (Math.random() - 0.5) * 3);
  const dir = new THREE.Vector3().subVectors(to, from).setY(0).normalize();
  const spinAxis = new THREE.Vector3().crossVectors(UP, dir).normalize(); // rolls forward along the throw

  return {
    mesh,
    body,
    decals,
    radius,
    final,
    spinAxis,
    spinTurns: 2.5 + Math.random() * 2,
    from,
    to,
    delay: index * 0.07,
    bounce: 1.2 + Math.random() * 0.8,
    kept: d.kept,
  };
}

// ------------------------------------------------------------------ animation

const dice: Die[] = (show?.dice ?? []).map((d, i, all) => makeDie(d, i, all.length));
dice.forEach((d) => scene.add(d.mesh));

const caption = document.getElementById("caption")!;
if (show) {
  (caption.querySelector(".who") as HTMLElement).textContent = `${show.title} · ${show.label}`;
  (caption.querySelector(".result") as HTMLElement).textContent = show.result || "";
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const tmpQ = new THREE.Quaternion();
let start = -1;
let captionShown = false;

function place(d: Die, t: number) {
  const local = Math.max(0, Math.min(1, (t - d.delay) / ROLL_TIME));
  const e = easeOut(local);
  d.mesh.position.lerpVectors(d.from, d.to, e);
  // falling + a couple of decaying bounces
  const hop = Math.abs(Math.cos(local * Math.PI * 2.5)) * Math.pow(1 - local, 2) * d.bounce * 2.2;
  d.mesh.position.y = d.radius + hop;
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

function frame(now: number) {
  if (start < 0) start = now;
  const t = (now - start) / 1000;
  dice.forEach((d) => place(d, t));
  renderer.render(scene, camera);
  const settled = t > ROLL_TIME + (dice.length - 1) * 0.07;
  if (settled && !captionShown) {
    captionShown = true;
    caption.classList.add("show");
  }
  if (t < ROLL_TIME + HOLD_TIME + dice.length * 0.07) requestAnimationFrame(frame);
  else close();
}

function close() {
  void OBR.popover.close(DICE_POPOVER_ID);
}

// Opened directly (outside Owlbear, e.g. to preview): just play the throw once.
if (window.parent === window) requestAnimationFrame(frame);

OBR.onReady(() => {
  document.body.addEventListener("click", close);
  if (!dice.length) close();
  else requestAnimationFrame(frame);
});
