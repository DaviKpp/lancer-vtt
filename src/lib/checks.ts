// Structure damage and overheating (stress) checks — LANCER core tables, summarized in PT-BR.
//
// When a character marks structure (or stress), roll 1d6 per point of structure (or stress)
// damage it has marked, keep the LOWEST result and look it up below. Two or more 1s is the
// worst outcome. At 0 structure/stress there is no roll: the mech is destroyed / melts down.
import { rollDie } from "./dice";

export type CheckKind = "structure" | "stress";

export interface CheckResult {
  kind: CheckKind;
  dice: number[];
  lowest: number;
  title: string;
  text: string;
  /** Conditions applied automatically. */
  statuses: string[];
  destroyed?: boolean;
  trauma?: "mount" | "system";
}

export function rollCheck(kind: CheckKind, remaining: number, max: number): CheckResult {
  const n = Math.max(1, max - remaining);
  const dice = Array.from({ length: n }, () => rollDie(6));
  const lowest = Math.min(...dice);
  const ones = dice.filter((d) => d === 1).length;
  return kind === "structure" ? structure(dice, lowest, ones, remaining) : stress(dice, lowest, ones, remaining);
}

function structure(dice: number[], lowest: number, ones: number, remaining: number): CheckResult {
  const base = { kind: "structure" as const, dice, lowest };
  if (ones >= 2) {
    return { ...base, title: "Golpe Esmagador", text: "Dois ou mais 1: o mech é destruído.", statuses: [], destroyed: true };
  }
  if (lowest >= 5) {
    return { ...base, title: "Golpe de Raspão", text: "O mech fica Prejudicado até o fim do seu próximo turno.", statuses: ["impaired"] };
  }
  if (lowest >= 2) {
    const sub = rollDie(6);
    const what =
      sub <= 3
        ? "todas as armas de uma montagem à sua escolha são destruídas"
        : "um sistema à sua escolha é destruído";
    return {
      ...base,
      title: "Trauma de Sistema",
      trauma: sub <= 3 ? "mount" : "system",
      text: `1d6 = ${sub}: ${what}. (Se não houver armas ou sistemas válidos, destrói a outra opção; se não houver nenhum, vira Acerto Direto.)`,
      statuses: [],
    };
  }
  // a single 1: Direct Hit, depends on how much structure is left
  if (remaining >= 3) {
    return { ...base, title: "Acerto Direto", text: "O mech fica Atordoado até o fim do seu próximo turno.", statuses: ["stunned"] };
  }
  if (remaining === 2) {
    return {
      ...base,
      title: "Acerto Direto",
      text: "Faça um teste de Casco. Sucesso: Atordoado até o fim do seu próximo turno. Falha: o mech é destruído.",
      statuses: [],
    };
  }
  return { ...base, title: "Acerto Direto", text: "Com 1 de estrutura restante, o mech é destruído.", statuses: [], destroyed: true };
}

function stress(dice: number[], lowest: number, ones: number, remaining: number): CheckResult {
  const base = { kind: "stress" as const, dice, lowest };
  if (ones >= 2) {
    return {
      ...base,
      title: "Colapso Irreversível",
      text: "Dois ou mais 1: o reator entra em colapso e explode no fim do seu próximo turno.",
      statuses: [],
    };
  }
  if (lowest >= 5) {
    return { ...base, title: "Desvio de Emergência", text: "O mech fica Prejudicado até o fim do seu próximo turno.", statuses: ["impaired"] };
  }
  if (lowest >= 2) {
    return {
      ...base,
      title: "Usina Desestabilizada",
      text: "O mech fica Exposto até remover o estado (por exemplo, com Estabilizar).",
      statuses: ["exposed"],
    };
  }
  if (remaining >= 3) {
    return { ...base, title: "Colapso", text: "O mech fica Exposto.", statuses: ["exposed"] };
  }
  if (remaining === 2) {
    return {
      ...base,
      title: "Colapso",
      text: "Faça um teste de Engenharia. Sucesso: o mech fica Exposto. Falha: o reator entra em colapso depois de 1d6 dos seus turnos (o mestre rola); dá para evitar repetindo o teste de Engenharia como ação livre.",
      statuses: [],
    };
  }
  return {
    ...base,
    title: "Colapso",
    text: "Com 1 de estresse restante, o reator entra em colapso no fim do seu próximo turno.",
    statuses: [],
  };
}

export const CHECK_LABEL: Record<CheckKind, string> = {
  structure: "Teste de Estrutura",
  stress: "Teste de Superaquecimento",
};
