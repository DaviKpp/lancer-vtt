import type { Sheet } from "../lib/types";
import { signed } from "./common";

/** Compact attributes for the encounter list (GM and the sheet's owner). */
export function StatLine({ sheet }: { sheet: Sheet }) {
  const items: [string, string | number][] =
    sheet.kind === "mech"
      ? [
          ["Arm", sheet.stats.armor],
          ["Eva", sheet.stats.evasion],
          ["Def-E", sheet.stats.edef],
          ["Vel", sheet.stats.speed],
          ["Sens", sheet.stats.sensor],
          ["Salv", sheet.stats.save],
          ["Tech", signed(sheet.stats.techAttack)],
          ["Atq", signed(sheet.stats.attackBonus)],
          ["Tam", sheet.stats.size],
        ]
      : [
          ["Arm", sheet.stats.armor],
          ["Eva", sheet.stats.evasion],
          ["Def-E", sheet.stats.edef],
          ["Vel", sheet.stats.speed],
          ["Sens", sheet.stats.sensor],
          ["Salv", sheet.stats.save],
          ["Tech", signed(sheet.stats.techAttack)],
          ["Ativ", sheet.stats.activations],
          ["Tam", sheet.stats.size],
        ];
  const title: Record<string, string> = {
    Arm: "Armadura",
    Eva: "Evasão",
    "Def-E": "Defesa-E",
    Vel: "Velocidade",
    Sens: "Sensores",
    Salv: "Salvaguarda (alvo das suas salvaguardas impostas)",
    Tech: "Ataque Tech",
    Atq: "Bônus de ataque (Grit)",
    Ativ: "Ativações",
    Tam: "Tamanho",
  };
  return (
    <div className="stat-line">
      {items.map(([k, v]) => (
        <span key={k} className="stat-pill" title={title[k]}>
          <span className="muted">{k}</span> <b>{v}</b>
        </span>
      ))}
    </div>
  );
}
