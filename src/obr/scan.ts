// SCAN over the network. NPC sheets (templates) and every mech sheet live only in the GM's browser,
// so the scanning player asks; the GM's background page (always running while the GM is in the room)
// builds the report from its copy of the sheet and answers. Without a GM, the scanner gets only what
// the room state knows (HP, heat, defenses...).
import OBR from "@owlbear-rodeo/sdk";
import type { CombatantState, NpcSheet, Sheet } from "../lib/types";
import { scanReport, type ScanAsk, type ScanReport } from "../lib/scan";
import { applyDestroyed } from "../lib/destroyed";
import { uid } from "../lib/util";
import { ID } from "./constants";
import { getRoomState } from "./room";
import { pushToast } from "./toast";

const SCAN_CHANNEL = `${ID}/scan`;
const TIMEOUT = 5000;

type Req = { t: "req"; rid: string; scanner: string; targetId: string; ask: ScanAsk; question?: string };
type Res = { t: "res"; rid: string; report: ScanReport };

/** The GM's copy of a combatant's sheet, read straight from storage (same origin as the popover). */
async function sheetOf(c: CombatantState, combatants: Record<string, CombatantState>): Promise<Sheet | undefined> {
  const id = c.kind === "pilot" && c.pm ? c.pm : c.id;
  const owner = combatants[id] ?? c;
  try {
    const sheets = JSON.parse(localStorage.getItem(`lancer-vtt:${OBR.room.id}:sheets`) ?? "[]") as Sheet[];
    const local = sheets.find((s) => s.id === id);
    if (local) return applyDestroyed(local, owner);
    if (owner.tpl) {
      const templates = JSON.parse(localStorage.getItem("lancer-vtt:npc-templates") ?? "[]") as NpcSheet[];
      const tpl = templates.find((t) => t.id === owner.tpl);
      if (tpl) return applyDestroyed({ ...tpl, raw: undefined, id: owner.id, name: owner.name }, owner);
    }
  } catch {
    // storage unavailable
  }
  return undefined;
}

/**
 * Asks for a scan and waits for the GM's answer. Without one, "stats" falls back to the room state
 * (`gm: false`); the other questions get null (only the GM can answer them).
 */
export async function requestScan(
  scanner: string,
  target: CombatantState,
  ask: ScanAsk,
  question?: string,
): Promise<{ report: ScanReport; gm: boolean } | null> {
  const rid = uid();
  const answer = new Promise<ScanReport | null>((resolve) => {
    const timer = setTimeout(() => {
      stop();
      resolve(null);
    }, TIMEOUT);
    const stop = OBR.broadcast.onMessage(SCAN_CHANNEL, (e) => {
      const m = e.data as Res;
      if (m?.t !== "res" || m.rid !== rid) return;
      clearTimeout(timer);
      stop();
      resolve(m.report);
    });
  });
  await OBR.broadcast.sendMessage(SCAN_CHANNEL, { t: "req", rid, scanner, targetId: target.id, ask, question } satisfies Req, {
    destination: "ALL",
  });
  const report = await answer;
  if (report) return { report, gm: true };
  return ask === "stats" ? { report: scanReport(target, undefined), gm: false } : null;
}

/** GM side: answers scans. Call once from the background page. */
export function startScanResponder() {
  OBR.onReady(() => {
    OBR.broadcast.onMessage(SCAN_CHANNEL, async (e) => {
      const m = e.data as Req;
      if (m?.t !== "req" || (await OBR.player.getRole()) !== "GM") return;
      const { combatants } = await getRoomState();
      const target = combatants[m.targetId];
      if (!target) return;
      if (m.ask !== "stats") {
        // hidden / generic information: the GM answers in person
        pushToast(
          `${m.scanner} escaneou ${target.name} e pede ${m.ask === "hidden" ? "uma informação oculta" : "uma informação pública"}${
            m.question ? `: “${m.question}”` : ""
          }. Responda ao jogador.`,
          "WARNING",
        );
        const report: ScanReport = {
          title: `Escaneamento de ${target.name}`,
          sections: [{ title: "Pedido enviado ao Mestre", items: ["O Mestre recebeu o pedido e vai responder."] }],
        };
        await OBR.broadcast.sendMessage(SCAN_CHANNEL, { t: "res", rid: m.rid, report } satisfies Res, { destination: "ALL" });
        return;
      }
      const report = scanReport(target, await sheetOf(target, combatants));
      await OBR.broadcast.sendMessage(SCAN_CHANNEL, { t: "res", rid: m.rid, report } satisfies Res, { destination: "ALL" });
    });
  });
}
