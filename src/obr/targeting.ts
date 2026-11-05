// Attacker → target arrow, with the distance between them in the middle.
//
// While an attack panel has a target, the popover broadcasts the arrow to ALL players; every
// background page draws it as local items (nothing is stored in the scene) and keeps it on the
// tokens when they move. It goes away when the attack panel closes (or after a safety timeout).
import OBR, { buildPath, buildText, Command, type Item, type PathCommand, type Vector2 } from "@owlbear-rodeo/sdk";
import { ID } from "./constants";

const ARROW_CHANNEL = `${ID}/arrow`;
const ARROW_KEY = `${ID}/arrow`;
const ARROW_TTL = 3 * 60_000;

type ArrowMsg = { attackerId: string; from?: string; to?: string };

// ---------------------------------------------------------------- legacy tool

/**
 * An earlier version added an "Escolher alvo" tool to the toolbar. A background page that is still
 * running that version keeps it registered, so remove it (and leave it if it's the active tool).
 */
export async function removeLegacyTargetTool() {
  const tool = `${ID}/target-tool`;
  try {
    if ((await OBR.tool.getActiveTool()) === tool) await OBR.tool.activateTool("rodeo.owlbear.tool/move");
  } catch {
    // ignore
  }
  await OBR.tool.removeMode(`${ID}/target-mode`).catch(() => undefined);
  await OBR.tool.remove(tool).catch(() => undefined);
}

// ---------------------------------------------------------------- popover side

/** Shows (to everyone) an arrow from the attacker's token to the target's token. */
export function showArrow(attackerId: string, from: string, to: string) {
  return OBR.broadcast.sendMessage(ARROW_CHANNEL, { attackerId, from, to } satisfies ArrowMsg, { destination: "ALL" });
}

export function clearArrow(attackerId: string) {
  return OBR.broadcast.sendMessage(ARROW_CHANNEL, { attackerId } satisfies ArrowMsg, { destination: "ALL" });
}

// ---------------------------------------------------------------- drawing

const RED = "#e2382c";

function center(b: { min: Vector2; max: Vector2 }): Vector2 {
  return { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
}

/** Filled arrow polygon from `a` to `b` (absolute coordinates; the item sits at 0,0). */
function arrowCommands(a: Vector2, b: Vector2, dpi: number): PathCommand[] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < dpi * 0.3) return null;
  const u = { x: dx / len, y: dy / len };
  const n = { x: -u.y, y: u.x };
  const shaft = dpi * 0.09;
  const headLen = Math.min(dpi * 0.45, len * 0.5);
  const headW = dpi * 0.36;
  const s = { x: b.x - u.x * headLen, y: b.y - u.y * headLen };
  const p = (o: Vector2, w: number): [number, number] => [o.x + n.x * w, o.y + n.y * w];
  return [
    [Command.MOVE, ...p(a, shaft / 2)],
    [Command.LINE, ...p(s, shaft / 2)],
    [Command.LINE, ...p(s, headW / 2)],
    [Command.LINE, b.x, b.y],
    [Command.LINE, ...p(s, -headW / 2)],
    [Command.LINE, ...p(s, -shaft / 2)],
    [Command.LINE, ...p(a, -shaft / 2)],
    [Command.CLOSE],
  ];
}

function buildArrow(id: string, commands: PathCommand[], dpi: number): Item {
  return buildPath()
    .id(id)
    .name("LANCER alvo")
    .position({ x: 0, y: 0 })
    .commands(commands)
    .fillColor(RED)
    .fillOpacity(0.85)
    .strokeColor("#000000")
    .strokeOpacity(0.8)
    .strokeWidth(Math.max(1, dpi * 0.02))
    .layer("RULER")
    .zIndex(0)
    .locked(true)
    .disableHit(true)
    .metadata({ [ARROW_KEY]: true })
    .build();
}

function labelBox(mid: Vector2, dpi: number) {
  const width = dpi * 2;
  const height = dpi * 0.5;
  return { position: { x: mid.x - width / 2, y: mid.y - height / 2 }, width, height, fontSize: Math.max(12, dpi * 0.3) };
}

function buildLabelItem(id: string, text: string, mid: Vector2, dpi: number): Item {
  const box = labelBox(mid, dpi);
  return buildText()
    .id(id)
    .name("LANCER distância")
    .position(box.position)
    .textType("PLAIN")
    .plainText(text)
    .width(box.width)
    .height(box.height)
    .fontSize(box.fontSize)
    .fontWeight(800)
    .fillColor("#ffffff")
    .strokeColor("#000000")
    .strokeOpacity(1)
    .strokeWidth(Math.max(2, box.fontSize * 0.16))
    .textAlign("CENTER")
    .textAlignVertical("MIDDLE")
    .padding(0)
    .layer("RULER")
    .zIndex(1)
    .locked(true)
    .disableHit(true)
    .metadata({ [ARROW_KEY]: true })
    .build();
}

/** "5" in grid units, using the scene's scale (e.g. "25 ft" if the grid says 5ft). */
async function distanceText(a: Vector2, b: Vector2) {
  const [cells, scale] = await Promise.all([OBR.scene.grid.getDistance(a, b), OBR.scene.grid.getScale()]);
  const { multiplier, unit, digits } = scale.parsed;
  const value = (cells * (multiplier || 1)).toFixed(Math.max(0, digits ?? 0));
  return unit ? `${value} ${unit}` : value;
}

/** Adds or updates the arrow + distance label for one attacker (removes them if too short). */
async function upsertArrow(baseId: string, a: Vector2, b: Vector2) {
  const dpi = await OBR.scene.grid.getDpi();
  const arrowId = baseId;
  const labelId = `${baseId}/label`;
  const commands = arrowCommands(a, b, dpi);
  const existing = new Set((await OBR.scene.local.getItems([arrowId, labelId])).map((i) => i.id));
  if (!commands) {
    if (existing.size) await OBR.scene.local.deleteItems([...existing]);
    return;
  }
  const text = await distanceText(a, b);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  const add: Item[] = [];
  if (!existing.has(arrowId)) add.push(buildArrow(arrowId, commands, dpi));
  if (!existing.has(labelId)) add.push(buildLabelItem(labelId, text, mid, dpi));
  if (add.length) await OBR.scene.local.addItems(add);

  const update = [arrowId, labelId].filter((id) => existing.has(id));
  if (update.length) {
    const box = labelBox(mid, dpi);
    await OBR.scene.local.updateItems(update, (drafts) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      for (const d of drafts as any[]) {
        if (d.id === arrowId) d.commands = commands;
        else {
          d.position = box.position;
          d.text.plainText = text;
        }
      }
    });
  }
}

// ---------------------------------------------------------------- background side

/** Draws the arrows broadcast by attack panels. Call once from the background page. */
export function startTargeting() {
  const arrows = new Map<string, { from: string; to: string; expires: number }>();
  let sceneReady = false;
  let drawing = false;
  let again = false;

  const tokenCenter = async (tokenId: string) => {
    try {
      return center(await OBR.scene.items.getItemBounds([tokenId]));
    } catch {
      return undefined; // token deleted
    }
  };

  async function drawArrows() {
    if (!sceneReady) return;
    if (drawing) {
      again = true;
      return;
    }
    drawing = true;
    try {
      const now = Date.now();
      const wanted = new Set<string>();
      for (const [attackerId, a] of arrows) {
        if (a.expires < now) {
          arrows.delete(attackerId);
          continue;
        }
        const [from, to] = await Promise.all([tokenCenter(a.from), tokenCenter(a.to)]);
        if (!from || !to) continue;
        const id = `${ARROW_KEY}/${attackerId}`;
        wanted.add(id);
        wanted.add(`${id}/label`);
        await upsertArrow(id, from, to);
      }
      const stale = await OBR.scene.local.getItems((i) => i.metadata[ARROW_KEY] !== undefined && !wanted.has(i.id));
      if (stale.length) await OBR.scene.local.deleteItems(stale.map((i) => i.id));
    } catch (e) {
      console.warn("[lancer-vtt] arrow render failed", e);
    } finally {
      drawing = false;
      if (again) {
        again = false;
        scheduleDraw();
      }
    }
  }

  let drawTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleDraw = () => {
    clearTimeout(drawTimer);
    drawTimer = setTimeout(() => void drawArrows(), 60);
  };

  OBR.onReady(async () => {
    void removeLegacyTargetTool();
    OBR.broadcast.onMessage(ARROW_CHANNEL, (e) => {
      const m = e.data as ArrowMsg;
      if (!m?.attackerId) return;
      if (m.from && m.to) arrows.set(m.attackerId, { from: m.from, to: m.to, expires: Date.now() + ARROW_TTL });
      else arrows.delete(m.attackerId);
      scheduleDraw();
    });
    setInterval(() => arrows.size && scheduleDraw(), 15_000); // expire stale arrows

    const onReady = async (ready: boolean) => {
      sceneReady = ready;
      if (!ready) return;
      const leftovers = await OBR.scene.local.getItems((i) => i.metadata[ARROW_KEY] !== undefined);
      if (leftovers.length) await OBR.scene.local.deleteItems(leftovers.map((i) => i.id));
      scheduleDraw();
    };
    OBR.scene.onReadyChange(onReady);
    // follow the tokens when they move
    OBR.scene.items.onChange(() => arrows.size && scheduleDraw());
    await onReady(await OBR.scene.isReady());
  });
}
