// Picking attack targets by clicking tokens on the map, and the attacker → target arrow.
//
// - The attack panel (popover) calls beginPick(): it stores the attacker in the tool's metadata
//   and switches to the "Escolher alvo" tool. The tool (created by the background page) shows a
//   preview arrow following the pointer; clicking a linked token reports it back over a LOCAL
//   broadcast and restores the previous tool.
// - Once a target is chosen the popover broadcasts the arrow to ALL players; every background
//   page draws it as a local item (nothing is stored in the scene) and keeps it on the tokens
//   when they move. It goes away when the attack panel closes (or after a safety timeout).
import OBR, { buildPath, Command, type Item, type PathCommand, type Vector2 } from "@owlbear-rodeo/sdk";
import type { CombatantState } from "../lib/types";
import { ID } from "./constants";
import { readRoomState } from "./room";

export const TARGET_TOOL_ID = `${ID}/target-tool`;
const TARGET_MODE_ID = `${ID}/target-mode`;
const PICK_CHANNEL = `${ID}/pick`;
const ARROW_CHANNEL = `${ID}/arrow`;
const ARROW_KEY = `${ID}/arrow`;
const PREVIEW_ID = `${ARROW_KEY}/preview`;
const ARROW_TTL = 3 * 60_000;

interface PickMeta {
  attackerId?: string;
  attackerTokenId?: string;
  prevTool?: string;
  [key: string]: unknown;
}
type PickMsg = { attackerId: string; targetId: string };
type ArrowMsg = { attackerId: string; from?: string; to?: string };

// ---------------------------------------------------------------- popover side

/** Switches to the targeting tool for `attacker` (needs a linked token). */
export async function beginPick(attacker: CombatantState) {
  if (!attacker.tokenId) return;
  const current = await OBR.tool.getActiveTool();
  const prevTool = current === TARGET_TOOL_ID ? ((await OBR.tool.getMetadata(TARGET_TOOL_ID)) as PickMeta)?.prevTool : current;
  await OBR.tool.setMetadata(TARGET_TOOL_ID, { attackerId: attacker.id, attackerTokenId: attacker.tokenId, prevTool });
  await OBR.tool.activateTool(TARGET_TOOL_ID);
}

/** Leaves the targeting tool (if it's still active), going back to the previous one. */
export async function endPick() {
  if ((await OBR.tool.getActiveTool()) !== TARGET_TOOL_ID) return;
  const meta = (await OBR.tool.getMetadata(TARGET_TOOL_ID)) as PickMeta | undefined;
  await OBR.tool.activateTool(meta?.prevTool || "rodeo.owlbear.tool/move");
}

/** Calls `fn` with the combatant id clicked while picking for `attackerId`. */
export function onPicked(attackerId: string, fn: (targetId: string) => void) {
  return OBR.broadcast.onMessage(PICK_CHANNEL, (e) => {
    const m = e.data as PickMsg;
    if (m?.attackerId === attackerId && m.targetId) fn(m.targetId);
  });
}

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

function buildArrow(id: string, commands: PathCommand[], dpi: number, faint: boolean): Item {
  return buildPath()
    .id(id)
    .name("LANCER alvo")
    .position({ x: 0, y: 0 })
    .commands(commands)
    .fillColor(RED)
    .fillOpacity(faint ? 0.45 : 0.85)
    .strokeColor("#000000")
    .strokeOpacity(0.8)
    .strokeWidth(Math.max(1, dpi * 0.02))
    .layer("RULER")
    .locked(true)
    .disableHit(true)
    .metadata({ [ARROW_KEY]: true })
    .build();
}

/** Adds or updates one local arrow item (or removes it when there's nothing to draw). */
async function upsertArrow(id: string, a: Vector2, b: Vector2, faint = false) {
  const dpi = await OBR.scene.grid.getDpi();
  const commands = arrowCommands(a, b, dpi);
  const existing = await OBR.scene.local.getItems([id]);
  if (!commands) {
    if (existing.length) await OBR.scene.local.deleteItems([id]);
    return;
  }
  if (!existing.length) {
    await OBR.scene.local.addItems([buildArrow(id, commands, dpi, faint)]);
    return;
  }
  await OBR.scene.local.updateItems([id], (drafts) => {
    for (const d of drafts) {
      const path = d as unknown as { commands: PathCommand[]; style: { fillOpacity: number } };
      path.commands = commands;
      path.style.fillOpacity = faint ? 0.45 : 0.85;
    }
  });
}

async function removeLocal(ids: string[]) {
  const existing = await OBR.scene.local.getItems(ids);
  if (existing.length) await OBR.scene.local.deleteItems(existing.map((i) => i.id));
}

// ---------------------------------------------------------------- background side

/** Creates the targeting tool and draws arrows. Call once from the background page. */
export function startTargeting() {
  let combatants: Record<string, CombatantState> = {};
  const arrows = new Map<string, { from: string; to: string; expires: number }>();
  let sceneReady = false;
  let previewBusy = false;
  let previewNext: (() => Promise<void>) | null = null;

  const byToken = (tokenId?: string) =>
    tokenId ? Object.values(combatants).find((c) => c.tokenId === tokenId) : undefined;

  const tokenCenter = async (tokenId: string) => {
    try {
      return center(await OBR.scene.items.getItemBounds([tokenId]));
    } catch {
      return undefined; // token deleted
    }
  };

  // Preview updates arrive on every pointer move: run them one at a time, keeping only the latest.
  const preview = (job: () => Promise<void>) => {
    if (previewBusy) {
      previewNext = job;
      return;
    }
    previewBusy = true;
    void job()
      .catch(() => undefined)
      .finally(() => {
        previewBusy = false;
        const next = previewNext;
        previewNext = null;
        if (next) preview(next);
      });
  };

  async function drawArrows() {
    if (!sceneReady) return;
    const now = Date.now();
    const wanted = new Set<string>();
    for (const [attackerId, a] of arrows) {
      if (a.expires < now) {
        arrows.delete(attackerId);
        continue;
      }
      const [from, to] = await Promise.all([tokenCenter(a.from), tokenCenter(a.to)]);
      const id = `${ARROW_KEY}/${attackerId}`;
      if (!from || !to) continue;
      wanted.add(id);
      await upsertArrow(id, from, to);
    }
    const stale = await OBR.scene.local.getItems(
      (i) => i.metadata[ARROW_KEY] !== undefined && i.id !== PREVIEW_ID && !wanted.has(i.id),
    );
    if (stale.length) await OBR.scene.local.deleteItems(stale.map((i) => i.id));
  }

  let drawTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleDraw = () => {
    clearTimeout(drawTimer);
    drawTimer = setTimeout(() => void drawArrows().catch(() => undefined), 60);
  };

  OBR.onReady(async () => {
    combatants = readRoomState(await OBR.room.getMetadata()).combatants;
    OBR.room.onMetadataChange((m) => {
      combatants = readRoomState(m).combatants;
    });

    await OBR.tool.create({
      id: TARGET_TOOL_ID,
      icons: [{ icon: "/target.svg", label: "Escolher alvo (LANCER)" }],
      defaultMode: TARGET_MODE_ID,
    });

    await OBR.tool.createMode({
      id: TARGET_MODE_ID,
      icons: [{ icon: "/target.svg", label: "Clique no token alvo", filter: { activeTools: [TARGET_TOOL_ID] } }],
      cursors: [{ cursor: "crosshair" }],
      preventDrag: { dragging: true },
      onToolMove(context, event) {
        const meta = context.metadata as PickMeta;
        if (!meta.attackerTokenId) return;
        const hovered = byToken(event.target?.id);
        const snap = hovered && hovered.id !== meta.attackerId ? hovered.tokenId : undefined;
        preview(async () => {
          const from = await tokenCenter(meta.attackerTokenId!);
          if (!from) return;
          const to = snap ? await tokenCenter(snap) : event.pointerPosition;
          await upsertArrow(PREVIEW_ID, from, to ?? event.pointerPosition, !snap);
        });
      },
      async onToolClick(context, event) {
        const meta = context.metadata as PickMeta;
        if (!meta.attackerId) {
          await OBR.notification.show("Abra um ataque na ficha para escolher o alvo.", "INFO");
          return;
        }
        const target = byToken(event.target?.id);
        if (!target || target.id === meta.attackerId) {
          await OBR.notification.show("Clique em um token vinculado a um combatente LANCER (Esc cancela).", "WARNING");
          return;
        }
        await OBR.broadcast.sendMessage(PICK_CHANNEL, { attackerId: meta.attackerId, targetId: target.id } satisfies PickMsg, {
          destination: "LOCAL",
        });
        await OBR.tool.activateTool(meta.prevTool || "rodeo.owlbear.tool/move");
      },
      onKeyDown(context, event) {
        if (event.key === "Escape") void OBR.tool.activateTool((context.metadata as PickMeta).prevTool || "rodeo.owlbear.tool/move");
      },
      onDeactivate() {
        previewNext = null;
        void removeLocal([PREVIEW_ID]).catch(() => undefined);
      },
    });

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
