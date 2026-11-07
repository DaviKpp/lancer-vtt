// SCAN (quick tech, LANCER core p.69): what a scan reveals about a character — its weapons, systems
// and full statistics. Built from the sheet by whoever holds it (the GM's browser), see obr/scan.ts.
import type { CombatantState, DamageEntry, RangeEntry, Sheet } from "./types";
import { tr } from "./i18n";
import { statusInfo } from "./statuses";

export type ScanAsk = "stats" | "hidden" | "generic";

export const SCAN_ASK_LABEL: Record<ScanAsk, string> = {
  stats: "Armas, sistemas e atributos completos",
  hidden: "Uma informação oculta (carga, missão, identidade do piloto...)",
  generic: "Informação pública/genérica (modelo, registros...)",
};

export interface ScanSection {
  title: string;
  items: string[];
}

export interface ScanReport {
  title: string;
  sections: ScanSection[];
}

const sg = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
const dmg = (d: DamageEntry[]) => d.map((x) => `${x.val} ${tr(x.type)}`).join(" + ");
const rng = (r: RangeEntry[]) => r.map((x) => `${tr(x.type)} ${x.val}`).join(", ");
const join = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(" · ");

/** Live numbers every scan shows (from the room state, so they're current). */
function liveStats(c: CombatantState): string[] {
  return [
    join(
      `PV ${c.hp}/${c.maxHp}`,
      c.os > 0 && `Sobrescudo ${c.os}`,
      c.maxStructure > 1 && `Estrutura ${c.structure}/${c.maxStructure}`,
      c.maxStress > 1 && `Estresse ${c.stress}/${c.maxStress}`,
      c.heatcap > 0 && `Calor ${c.heat}/${c.heatcap}`,
      c.burn > 0 && `Queimadura ${c.burn}`,
    ),
    join(`Armadura ${c.armor}`, `Evasão ${c.evasion}`, `Defesa-E ${c.edef}`),
  ];
}

/** Full report for "weapons, systems and full statistics". */
export function scanReport(c: CombatantState, sheet: Sheet | undefined): ScanReport {
  const sections: ScanSection[] = [];
  if (sheet?.kind === "npc") {
    const s = sheet.stats;
    sections.push({
      title: "Atributos",
      items: [
        join(`${sheet.className || sheet.name}`, `Tier ${sheet.tier}`, sheet.role && tr(sheet.role), sheet.templates.length > 0 && sheet.templates.join(", ")),
        ...liveStats(c),
        join(`Tamanho ${s.size}`, `Velocidade ${s.speed}`, `Sensores ${s.sensor}`, `Salvaguarda ${s.save}`, `Ativações ${s.activations}`),
        join(`Casco ${sg(s.hull)}`, `Agilidade ${sg(s.agi)}`, `Sistemas ${sg(s.sys)}`, `Engenharia ${sg(s.eng)}`, `Ataque Tech ${sg(s.techAttack)}`),
      ],
    });
    const weapons = sheet.features.filter((f) => f.type === "weapon" && !f.destroyed);
    if (weapons.length)
      sections.push({
        title: "Armas",
        items: weapons.map((f) =>
          join(f.name, f.weaponType, f.damage.length > 0 && dmg(f.damage), f.range.length > 0 && rng(f.range), `${sg(f.attackBonus)} ataque`),
        ),
      });
    const other = sheet.features.filter((f) => f.type !== "weapon" && !f.destroyed);
    if (other.length) sections.push({ title: "Sistemas e características", items: other.map((f) => join(f.name, tr(f.type))) });
  } else if (sheet?.kind === "mech") {
    const s = sheet.stats;
    sections.push({
      title: "Atributos",
      items: [
        join(`${sheet.mech.manufacturer} ${sheet.mech.frameName}`, `Piloto NL${sheet.pilot.level}`),
        ...liveStats(c),
        join(`Tamanho ${s.size}`, `Velocidade ${s.speed}`, `Sensores ${s.sensor}`, `Salvaguarda ${s.save}`),
        join(
          `Casco ${sheet.pilot.hase.hull}`,
          `Agilidade ${sheet.pilot.hase.agi}`,
          `Sistemas ${sheet.pilot.hase.sys}`,
          `Engenharia ${sheet.pilot.hase.eng}`,
          `Ataque Tech ${sg(s.techAttack)}`,
          `Ataque ${sg(s.attackBonus)}`,
        ),
      ],
    });
    const weapons = sheet.mounts.flatMap((m) => m.weapons).filter((w) => !w.destroyed);
    if (weapons.length)
      sections.push({
        title: "Armas",
        items: weapons.map((w) => join(w.name, `${tr(w.mount)} ${tr(w.type)}`, w.damage.length > 0 && dmg(w.damage), w.range.length > 0 && rng(w.range))),
      });
    const systems = sheet.systems.filter((x) => !x.destroyed);
    if (systems.length) sections.push({ title: "Sistemas", items: systems.map((x) => x.name) });
  } else {
    // nobody holds the sheet (the GM isn't in the room): only what the room state knows
    sections.push({ title: "Atributos", items: liveStats(c) });
  }
  if (c.st?.length) sections.push({ title: "Condições e status", items: c.st.map((s) => statusInfo(s)?.name ?? tr(s)) });
  return { title: `Escaneamento de ${c.name}`, sections };
}
