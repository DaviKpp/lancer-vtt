// Token HUD: bars and labels drawn on top of linked tokens.
//
// Uses OBR *local* items (each client draws its own, nothing is synced), which lets every
// viewer see something different:
//   - Lancers (player mechs): everyone sees HP + conditions above the token and
//     heat / structure / stress below it.
//   - NPCs: the GM sees the same as above; players only see statuses and conditions.
//   - Destroyed combatants (no structure left, or reactor meltdown) get a red X for everyone.
import OBR, { buildPath, buildShape, buildText, Command, type Item, type PathCommand } from "@owlbear-rodeo/sdk";
import type { CombatantState } from "../lib/types";
import { activeStatuses, statusInfo } from "../lib/statuses";
import { HUD_KEY } from "./constants";
import { readRoomState } from "./room";
import { TURN_COLOR, turnStateOf, type TurnState } from "../lib/turn";
import type { EncounterState } from "../lib/types";

type Role = "GM" | "PLAYER";
type Vec = { x: number; y: number };

interface RectSpec {
  kind: "rect";
  id: string;
  tokenId: string;
  position: Vec;
  width: number;
  height: number;
  color: string;
  opacity: number;
  z: number;
}
interface TextSpec {
  kind: "text";
  id: string;
  tokenId: string;
  position: Vec;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize: number;
  align: "TOP" | "BOTTOM";
  z: number;
}
interface PathSpec {
  kind: "path";
  id: string;
  tokenId: string;
  position: Vec;
  commands: PathCommand[];
  color: string;
  strokeWidth: number;
  /** Filled shape (turn dot); without it the path is only stroked (destroyed X). */
  fill?: string;
  z: number;
}
type Spec = RectSpec | TextSpec | PathSpec;

const COLORS = {
  barBg: "#111318",
  hp: "#3fb36b",
  hpLow: "#e2382c",
  shield: "#4fa3ff",
  heat: "#f08a24",
  text: "#ffffff",
  condition: "#ff8a80", // conditions (Emperrado, Lento...) — red
  status: "#8ecbff", // statuses (Oculto, Exposto...) — blue
  outline: "#000000",
  destroyed: "#e2382c",
};

export function isDestroyed(c: CombatantState) {
  return c.structure <= 0 || (c.maxStress > 0 && c.stress <= 0);
}

/** Red X in the middle of the token (with a dark outline so it reads on any art). */
function destroyedX(c: CombatantState, b: { min: Vec; max: Vec; width: number }): Spec[] {
  const tokenId = c.tokenId as string;
  const w = b.max.x - b.min.x;
  const h = b.max.y - b.min.y;
  // a square in the middle of the token, half its size, so the X stays inside the token's art
  // (the stroke's half-width included)
  const size = Math.min(w, h) * 0.5;
  const stroke = Math.max(3, size * 0.14);
  const r = size / 2 - stroke * 0.75;
  const cx = w / 2;
  const cy = h / 2;
  const commands: PathCommand[] = [
    [Command.MOVE, cx - r, cy - r],
    [Command.LINE, cx + r, cy + r],
    [Command.MOVE, cx + r, cy - r],
    [Command.LINE, cx - r, cy + r],
  ];
  const base = { kind: "path" as const, tokenId, position: b.min, commands };
  return [
    { ...base, id: `${HUD_KEY}/${tokenId}/x-outline`, color: COLORS.outline, strokeWidth: stroke * 1.5, z: 4 },
    { ...base, id: `${HUD_KEY}/${tokenId}/x`, color: COLORS.destroyed, strokeWidth: stroke, z: 5 },
  ];
}

/** Turn dot in the token's top-left corner: green = acting, yellow = still to play, red = already played. */
function turnDot(c: CombatantState, b: { min: Vec; max: Vec }, turn: TurnState): Spec {
  const tokenId = c.tokenId as string;
  const size = Math.min(b.max.x - b.min.x, b.max.y - b.min.y);
  const r = Math.max(5, size * 0.085);
  const cx = size * 0.15;
  const cy = size * 0.15;
  const commands: PathCommand[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    commands.push([i ? Command.LINE : Command.MOVE, cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  commands.push([Command.CLOSE]);
  return {
    kind: "path",
    id: `${HUD_KEY}/${tokenId}/turn`,
    tokenId,
    position: b.min,
    commands,
    color: COLORS.outline,
    strokeWidth: Math.max(1.5, r * 0.3),
    fill: TURN_COLOR[turn],
    z: 6,
  };
}

function round(v: number) {
  return Math.round(v * 10) / 10;
}

/** Builds the HUD pieces for one token. `b` is the token's bounding box. */
function specsFor(c: CombatantState, b: { min: Vec; max: Vec; width: number }, dpi: number, role: Role, turn?: TurnState): Spec[] {
  // lancers and their pilots are open to everyone; NPC numbers only to the GM
  const showNumbers = c.kind !== "npc" || role === "GM";
  const active = activeStatuses(c).map((sid) => statusInfo(sid));
  const names = (type: "Status" | "Condition") =>
    active
      .filter((x) => x?.type === type)
      .map((x) => x!.name)
      .join(" · ");
  const conditions = names("Condition");
  // an empty mech (pilot dismounted) says so, with the statuses
  const statuses = [c.dm ? "Sem piloto" : "", names("Status")].filter(Boolean).join(" · ");
  const out: Spec[] = isDestroyed(c) ? destroyedX(c, b) : [];
  if (turn) out.push(turnDot(c, b, turn));
  if (!showNumbers && !conditions && !statuses) return out.map((s) => ({ ...s, position: { x: round(s.position.x), y: round(s.position.y) } }));

  const id = (part: string) => `${HUD_KEY}/${c.tokenId}/${part}`;
  const tokenId = c.tokenId as string;
  const w = b.width;
  const cx = (b.min.x + b.max.x) / 2;
  const gap = dpi * 0.04;
  const barH = Math.max(4, dpi * 0.09);
  const font = Math.max(10, dpi * 0.15);
  const lineH = font * 1.25;
  const textW = Math.max(w * 3, dpi * 3);

  // ---- above the token (stacking upwards) ----
  let y = b.min.y - gap;
  if (showNumbers) {
    y -= barH;
    const ratio = Math.max(0, Math.min(1, c.hp / Math.max(1, c.maxHp)));
    out.push({ kind: "rect", id: id("hp-bg"), tokenId, position: { x: b.min.x, y }, width: w, height: barH, color: COLORS.barBg, opacity: 0.75, z: 0 });
    if (ratio > 0)
      out.push({
        kind: "rect",
        id: id("hp"),
        tokenId,
        position: { x: b.min.x, y },
        width: w * ratio,
        height: barH,
        color: ratio <= 0.25 ? COLORS.hpLow : COLORS.hp,
        opacity: 1,
        z: 1,
      });
    if (c.os > 0)
      out.push({
        kind: "rect",
        id: id("os"),
        tokenId,
        position: { x: b.min.x, y: y - barH * 0.45 },
        width: w * Math.min(1, c.os / Math.max(1, c.maxHp)),
        height: barH * 0.4,
        color: COLORS.shield,
        opacity: 1,
        z: 2,
      });
    y -= gap * 0.5 + lineH;
    out.push({
      kind: "text",
      id: id("hp-text"),
      tokenId,
      position: { x: cx - textW / 2, y },
      width: textW,
      height: lineH,
      text: `PV ${c.hp}/${c.maxHp}${c.os ? ` (+${c.os})` : ""}`,
      color: COLORS.text,
      fontSize: font,
      align: "BOTTOM",
      z: 3,
    });
  }
  // Conditions sit right above the HP; statuses go on top of them, each in its own color.
  const line = (part: string, text: string, color: string) => {
    y -= lineH;
    out.push({
      kind: "text",
      id: id(part),
      tokenId,
      position: { x: cx - textW / 2, y },
      width: textW,
      height: lineH,
      text,
      color,
      fontSize: font * 0.9,
      align: "BOTTOM",
      z: 3,
    });
  };
  if (conditions) line("conditions", conditions, COLORS.condition);
  if (statuses) line("statuses", statuses, COLORS.status);

  // ---- below the token (pilots have no heat / structure / stress) ----
  if (showNumbers && c.kind !== "pilot") {
    let by = b.max.y + gap;
    const heatRatio = Math.max(0, Math.min(1, c.heat / Math.max(1, c.heatcap)));
    if (c.heatcap > 0) {
      out.push({ kind: "rect", id: id("heat-bg"), tokenId, position: { x: b.min.x, y: by }, width: w, height: barH, color: COLORS.barBg, opacity: 0.75, z: 0 });
      if (heatRatio > 0)
        out.push({ kind: "rect", id: id("heat"), tokenId, position: { x: b.min.x, y: by }, width: w * heatRatio, height: barH, color: COLORS.heat, opacity: 1, z: 1 });
      by += barH + gap * 0.5;
    }
    out.push({
      kind: "text",
      id: id("bottom-text"),
      tokenId,
      position: { x: cx - textW / 2, y: by },
      width: textW,
      height: lineH * 2,
      text: `Calor ${c.heat}/${c.heatcap}${c.burn ? ` · Queim. ${c.burn}` : ""}\nEstrutura ${c.structure}/${c.maxStructure} · Estresse ${c.stress}/${c.maxStress}`,
      color: COLORS.text,
      fontSize: font * 0.9,
      align: "TOP",
      z: 3,
    });
  }
  return out.map((s) => ({ ...s, position: { x: round(s.position.x), y: round(s.position.y) } }));
}

function build(s: Spec): Item {
  // Shared item settings; both builders support these (typed loosely to chain across builder types).
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const common = <T,>(b: T): T =>
    (b as any)
      .id(s.id)
      .name("LANCER HUD")
      .position(s.position)
      .attachedTo(s.tokenId)
      .layer("ATTACHMENT")
      .locked(true)
      .disableHit(true)
      .disableAutoZIndex(true)
      .zIndex(s.z)
      .disableAttachmentBehavior(["ROTATION", "SCALE", "LOCKED", "COPY"])
      .metadata({ [HUD_KEY]: s.tokenId });
  if (s.kind === "path") {
    return common(buildPath())
      .commands(s.commands)
      .fillColor(s.fill ?? "#000000")
      .fillOpacity(s.fill ? 1 : 0)
      .strokeColor(s.color)
      .strokeOpacity(1)
      .strokeWidth(s.strokeWidth)
      .build();
  }
  if (s.kind === "rect") {
    return common(buildShape())
      .shapeType("RECTANGLE")
      .width(s.width)
      .height(s.height)
      .fillColor(s.color)
      .fillOpacity(s.opacity)
      .strokeWidth(0)
      .strokeOpacity(0)
      .build();
  }
  return common(buildText())
    .textType("PLAIN")
    .plainText(s.text)
    .width(s.width)
    .height(s.height)
    .fontSize(s.fontSize)
    .fontWeight(700)
    .fillColor(s.color)
    .strokeColor(COLORS.outline)
    .strokeOpacity(1)
    .strokeWidth(Math.max(1, s.fontSize * 0.12))
    .textAlign("CENTER")
    .textAlignVertical(s.align)
    .padding(0)
    .lineHeight(1.25)
    .build();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function applyTo(draft: any, s: Spec) {
  draft.position = s.position;
  draft.zIndex = s.z;
  if (s.kind === "path") {
    draft.commands = s.commands;
    draft.style.strokeWidth = s.strokeWidth;
    draft.style.strokeColor = s.color;
    if (s.fill) {
      draft.style.fillColor = s.fill;
      draft.style.fillOpacity = 1;
    }
  } else if (s.kind === "rect") {
    draft.width = s.width;
    draft.height = s.height;
    draft.style.fillColor = s.color;
    draft.style.fillOpacity = s.opacity;
  } else {
    draft.text.plainText = s.text;
    draft.text.width = s.width;
    draft.text.height = s.height;
    draft.text.style.fillColor = s.color;
    draft.text.style.fontSize = s.fontSize;
    draft.text.style.textAlignVertical = s.align;
  }
}

/** Starts the HUD renderer. Call once from the background page. */
export function startHud() {
  let role: Role = "PLAYER";
  let combatants: Record<string, CombatantState> = {};
  let encounter: EncounterState | null = null;
  let sceneReady = false;
  let tokens: Item[] = [];
  const rendered = new Map<string, string>(); // id -> serialized spec
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void render(), 120);
  };

  async function clearAll() {
    rendered.clear();
    try {
      const mine = await OBR.scene.local.getItems((i) => i.metadata[HUD_KEY] !== undefined);
      if (mine.length) await OBR.scene.local.deleteItems(mine.map((i) => i.id));
    } catch {
      // scene closed
    }
  }

  async function render() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      if (!sceneReady) return;
      const dpi = await OBR.scene.grid.getDpi();
      const present = new Set(tokens.map((t) => t.id));
      const desired: Spec[] = [];
      // ask Owlbear for every token's bounds at once instead of one round trip per token
      const linked = Object.values(combatants).filter((c) => c.tokenId && present.has(c.tokenId));
      const bounds = await Promise.all(linked.map((c) => OBR.scene.items.getItemBounds([c.tokenId as string]).catch(() => null)));
      linked.forEach((c, i) => {
        const b = bounds[i];
        if (b) desired.push(...specsFor(c, b, dpi, role, turnStateOf(c, encounter, combatants)));
      });
      const want = new Map(desired.map((s) => [s.id, s]));
      const existing = new Set(
        (await OBR.scene.local.getItems((i) => i.metadata[HUD_KEY] !== undefined)).map((i) => i.id),
      );

      const toDelete = [...existing].filter((id) => !want.has(id));
      const toAdd = desired.filter((s) => !existing.has(s.id));
      const toUpdate = desired.filter((s) => existing.has(s.id) && rendered.get(s.id) !== JSON.stringify(s));
      // A rect that turned into... (kinds never change for an id, so updates are safe)

      if (toDelete.length) await OBR.scene.local.deleteItems(toDelete);
      if (toAdd.length) await OBR.scene.local.addItems(toAdd.map(build));
      if (toUpdate.length) {
        const byId = new Map(toUpdate.map((s) => [s.id, s]));
        await OBR.scene.local.updateItems(
          toUpdate.map((s) => s.id),
          (drafts) => {
            for (const d of drafts) {
              const s = byId.get(d.id);
              if (s) applyTo(d, s);
            }
          },
        );
      }
      rendered.clear();
      for (const s of desired) rendered.set(s.id, JSON.stringify(s));
    } catch (e) {
      console.warn("[lancer-vtt] HUD render failed", e);
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  }

  const onItems = (items: Item[]) => {
    const linked = new Set(Object.values(combatants).map((c) => c.tokenId).filter(Boolean));
    const next = items.filter((i) => linked.has(i.id));
    // Only re-render when a linked token actually changed (position/size/visibility...).
    const sig = (list: Item[]) => JSON.stringify(list.map((i) => [i.id, i.position, i.scale, i.rotation, i.visible]));
    if (sig(next) !== sig(tokens)) {
      tokens = next;
      schedule();
    }
  };

  OBR.onReady(async () => {
    role = await OBR.player.getRole();
    OBR.player.onChange((p) => {
      if (p.role !== role) {
        role = p.role;
        schedule();
      }
    });

    ({ combatants, encounter } = readRoomState(await OBR.room.getMetadata()));
    const linkedKey = () =>
      Object.values(combatants)
        .map((c) => c.tokenId)
        .filter(Boolean)
        .sort()
        .join("|");
    let lastLinked = linkedKey();
    OBR.room.onMetadataChange((m) => {
      ({ combatants, encounter } = readRoomState(m));
      // Most room changes are numbers (HP, heat, actions...): just redraw. Re-read the scene only
      // when the set of linked tokens changed (it can be big, and room changes are frequent).
      const now = linkedKey();
      if (now === lastLinked) {
        schedule();
        return;
      }
      lastLinked = now;
      void OBR.scene.isReady().then(async (ready) => {
        if (ready) onItems(await OBR.scene.items.getItems());
        schedule();
      });
    });

    const onReady = async (ready: boolean) => {
      sceneReady = ready;
      if (ready) {
        await clearAll(); // remove leftovers from a previous session
        onItems(await OBR.scene.items.getItems());
        schedule();
      } else {
        tokens = [];
        rendered.clear();
      }
    };
    OBR.scene.onReadyChange(onReady);
    OBR.scene.items.onChange(onItems);
    await onReady(await OBR.scene.isReady());
  });
}
