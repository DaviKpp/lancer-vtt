// Attack animations on the map. The attacker broadcasts the shot to ALL; every background page
// animates it with local items (nothing is stored in the scene) and says LOCAL "done" when it
// finishes, so the roller's page can go on to the damage dice right after the shot lands.
import OBR, { buildPath, Command, type Item, type PathCommand } from "@owlbear-rodeo/sdk";
import type { CombatantState } from "../lib/types";
import { planFx, type Cmd, type FxLook, type FxStyle, type Prim } from "../lib/fxFrames";
import { isFxStyle, loadFxLook, sanitizeLook } from "../lib/fxPrefs";
import { ID } from "./constants";

const FX_CHANNEL = `${ID}/fx`;
const FX_DONE_CHANNEL = `${ID}/fx-done`;
const FX_KEY = `${ID}/fx`;
const MAX_WAIT = 3000; // never hold the roll longer than this, even if the animation can't run

interface FxMsg {
  id: string;
  from: string; // attacker token id
  to?: string; // target token id (none: a test shot 4 cells to the right)
  style: FxStyle;
  hit: boolean;
  seed: number;
  look?: FxLook; // the attacker's color / size
}

// ---------------------------------------------------------------- attacker side

/** Test shot from the player's own token, on their screen only (to try a color / size / effect). */
export async function previewShot(fromTokenId: string, style: FxStyle, look: FxLook) {
  const msg: FxMsg = { id: Math.random().toString(36).slice(2, 10), from: fromTokenId, style, hit: true, seed: Date.now() % 1e9, look };
  await OBR.broadcast.sendMessage(FX_CHANNEL, msg, { destination: "LOCAL" });
}

/**
 * Plays the shot from the attacker's token to the target's on everyone's screen and waits until it
 * lands on this one. Returns false (and plays nothing) when either side has no linked token.
 */
export async function playShot(attacker: CombatantState, target: CombatantState, style: FxStyle, hit: boolean): Promise<boolean> {
  if (!attacker.tokenId || !target.tokenId) return false;
  const msg: FxMsg = {
    id: Math.random().toString(36).slice(2, 10),
    from: attacker.tokenId,
    to: target.tokenId,
    style,
    hit,
    seed: Math.floor(Math.random() * 1e9),
    look: loadFxLook(style),
  };
  let off: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const done = new Promise<void>((resolve) => {
    off = OBR.broadcast.onMessage(FX_DONE_CHANNEL, (e) => {
      if ((e.data as { id?: string })?.id === msg.id) resolve();
    });
    timer = setTimeout(resolve, MAX_WAIT);
  });
  try {
    await OBR.broadcast.sendMessage(FX_CHANNEL, msg, { destination: "ALL" });
    await done;
    return true;
  } catch (e) {
    console.warn("[lancer-vtt] shot animation failed", e);
    return false;
  } finally {
    off?.();
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- background side

const toPath = (cmds: Cmd[]): PathCommand[] =>
  cmds.map((c) => (c[0] === "M" ? [Command.MOVE, c[1], c[2]] : c[0] === "L" ? [Command.LINE, c[1], c[2]] : [Command.CLOSE]));
const EMPTY: PathCommand[] = [
  [Command.MOVE, 0, 0],
  [Command.LINE, 0, 0],
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function center(b: { min: { x: number; y: number }; max: { x: number; y: number } }) {
  return { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
}

async function animate(m: FxMsg) {
  const itemId = (pid: string) => `${FX_KEY}/${m.id}/${pid}`;
  let ids: string[] = [];
  try {
    if (!(await OBR.scene.isReady())) return;
    const [fromB, dpi] = await Promise.all([OBR.scene.items.getItemBounds([m.from]), OBR.scene.grid.getDpi()]);
    const from = center(fromB);
    const to = m.to ? center(await OBR.scene.items.getItemBounds([m.to])) : { x: from.x + dpi * 4, y: from.y };
    const plan = planFx(m.style, from, to, dpi, m.hit, m.seed, sanitizeLook(m.look));
    ids = plan.ids.map(itemId);
    await OBR.scene.local.addItems(
      plan.ids.map((pid, i) =>
        buildPath()
          .id(itemId(pid))
          .name("LANCER efeito")
          .position({ x: 0, y: 0 })
          .commands(EMPTY)
          .fillOpacity(0)
          .strokeOpacity(0)
          .strokeWidth(0)
          .layer("RULER")
          .zIndex(10 + i)
          .locked(true)
          .disableHit(true)
          .metadata({ [FX_KEY]: true })
          .build() as Item,
      ),
    );
    // Background pages don't get animation frames, so step with timers; each step waits for
    // Owlbear to apply the previous one, which keeps the pace smooth without flooding it.
    const start = performance.now();
    for (;;) {
      const t = Math.min(plan.duration, (performance.now() - start) / 1000);
      const byId = new Map<string, Prim>(plan.at(t).map((p) => [itemId(p.id), p]));
      await OBR.scene.local.updateItems(ids, (drafts) => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        for (const d of drafts as any[]) {
          const p = byId.get(d.id);
          if (!p) {
            d.style.fillOpacity = 0;
            d.style.strokeOpacity = 0;
            continue;
          }
          d.commands = toPath(p.cmds);
          if (p.fill) d.style.fillColor = p.fill;
          d.style.fillOpacity = p.fill ? Math.max(0, p.fillOpacity ?? 1) : 0;
          if (p.stroke) {
            d.style.strokeColor = p.stroke;
            d.style.strokeWidth = p.strokeWidth ?? 2;
          }
          d.style.strokeOpacity = p.stroke ? Math.max(0, p.strokeOpacity ?? 1) : 0;
        }
      });
      if (t >= plan.duration) break;
      await sleep(16);
    }
  } catch (e) {
    console.warn("[lancer-vtt] shot animation failed", e);
  } finally {
    if (ids.length) await OBR.scene.local.deleteItems(ids).catch(() => undefined);
    // lets the attacker's page (on this screen) continue
    await OBR.broadcast.sendMessage(FX_DONE_CHANNEL, { id: m.id }, { destination: "LOCAL" }).catch(() => undefined);
  }
}

/** Plays the shots other players (and this one) broadcast. Call once from the background page. */
export function startFx() {
  OBR.onReady(async () => {
    OBR.broadcast.onMessage(FX_CHANNEL, (e) => {
      const m = e.data as FxMsg;
      if (m?.id && m.from && isFxStyle(m.style)) void animate(m);
    });
    // leftovers from an animation cut short (scene closed mid-shot)
    const cleanup = async (ready: boolean) => {
      if (!ready) return;
      const old = await OBR.scene.local.getItems((i) => i.metadata[FX_KEY] !== undefined);
      if (old.length) await OBR.scene.local.deleteItems(old.map((i) => i.id));
    };
    OBR.scene.onReadyChange((r) => void cleanup(r));
    await cleanup(await OBR.scene.isReady());
  });
}
