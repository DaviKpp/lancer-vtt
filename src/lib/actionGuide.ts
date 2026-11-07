// Quick reference of LANCER's core actions (summaries in our own words, PT-BR).
import type { ActionCost } from "./actions";

export type GuideRun =
  | "move"
  | "skirmish"
  | "barrage"
  | "invade"
  | "lockon"
  | "ram"
  | "grapple"
  | "hide"
  | "improvised"
  | "stabilize"
  | "overcharge"
  | "overwatch"
  | "shutdown"
  | "bootup"
  | "eject"
  | "bolster"
  | "search"
  | "scan"
  | "log";

export interface GuideAction {
  id: string;
  name: string;
  en: string;
  cost: ActionCost;
  desc: string;
  who: "mech" | "npc" | "both";
  run: GuideRun;
  /** NPCs follow simpler rules for some actions (Stabilize, Ram, Improvised Attack...). */
  npcDesc?: string;
}

export const TURN_RULES = [
  "No seu turno: um movimento padrão (até a sua Velocidade) e duas Ações Rápidas OU uma Ação Inteira.",
  "Ações Livres podem ser feitas à vontade; Protocolos só no início do turno, antes de qualquer outra ação.",
  "Reações: no máximo uma por turno (de qualquer personagem); cada reação tem seus usos, que voltam no início do seu turno.",
  "Sobrecarga: uma vez por turno, ganha uma Ação Rápida extra pagando calor (1 → 1d3 → 1d6 → 1d6+4).",
  "NPCs com várias ativações recebem um turno completo em cada ativação.",
];

export const GUIDE: { group: string; actions: GuideAction[] }[] = [
  {
    group: "Movimento",
    actions: [
      {
        id: "move",
        name: "Movimento padrão",
        en: "Move",
        cost: "move",
        who: "both",
        run: "move",
        desc: "Mova-se até a sua Velocidade. Pode ser dividido antes e depois das ações.",
      },
    ],
  },
  {
    group: "Ações Rápidas",
    actions: [
      {
        id: "skirmish",
        name: "Escaramuça",
        en: "Skirmish",
        cost: "quick",
        who: "both",
        run: "skirmish",
        desc: "Ataque com uma arma (não superpesada). Pode atacar junto com outra arma Auxiliar da mesma montagem, sem dano bônus.",
      },
      {
        id: "boost",
        name: "Impulsionar",
        en: "Boost",
        cost: "quick",
        who: "both",
        run: "log",
        desc: "Faça um movimento extra até a sua Velocidade.",
      },
      {
        id: "invade",
        name: "Invadir",
        en: "Invade",
        cost: "quick",
        who: "both",
        run: "invade",
        desc: "Tech Rápida: ataque tech contra um alvo nos Sensores. No acerto, ele recebe 2 de calor e um efeito de invasão (ex.: Fragmentar Sinal — Prejudicado e Lento até o fim do próximo turno).",
        npcDesc: "Tech Rápida: Sistemas contra a Defesa-E de um alvo nos Sensores. No acerto, ele recebe 2 de calor e fica Prejudicado até o fim do próximo turno.",
      },
      {
        id: "lockon",
        name: "Travar Mira",
        en: "Lock On",
        cost: "quick",
        who: "both",
        run: "lockon",
        desc: "Tech Rápida: um alvo nos Sensores e na linha de visão recebe Mira Travada (sem rolagem). O próximo ataque contra ele pode consumi-la por +1 Precisão.",
      },
      {
        id: "scan",
        name: "Escanear",
        en: "Scan",
        cost: "quick",
        who: "both",
        run: "scan",
        desc: "Tech Rápida: descubra atributos, armas, sistemas ou uma informação oculta de um alvo nos Sensores.",
      },
      {
        id: "bolster",
        name: "Reforçar",
        en: "Bolster",
        cost: "quick",
        who: "both",
        run: "bolster",
        desc: "Tech Rápida: um aliado nos Sensores ganha +2 Precisão no próximo teste de perícia ou salvaguarda.",
      },
      {
        id: "ram",
        name: "Investida",
        en: "Ram",
        cost: "quick",
        who: "both",
        run: "ram",
        desc: "Ataque corpo a corpo contra alvo adjacente do seu tamanho ou menor. No acerto ele fica Caído ou é empurrado 1 espaço.",
        npcDesc: "Ataque corpo a corpo (+Tier) contra alvo adjacente do seu tamanho ou menor. No acerto ele fica Caído e pode ser empurrado até 1 espaço.",
      },
      {
        id: "grapple",
        name: "Agarrar",
        en: "Grapple",
        cost: "quick",
        who: "both",
        run: "grapple",
        desc: "Ataque corpo a corpo contra alvo adjacente. No acerto vocês ficam agarrados (engajados, sem Impulsionar); o menor fica Imobilizado.",
        npcDesc: "Ataque corpo a corpo (+Tier) contra alvo adjacente; no acerto, agarra o alvo (mesmas regras de agarrar).",
      },
      {
        id: "hide",
        name: "Esconder-se",
        en: "Hide",
        cost: "quick",
        who: "both",
        run: "hide",
        desc: "Sem estar Engajado e fora da linha de visão (ou totalmente coberto; Invisível sempre pode), fica Oculto. Atacar, forçar salvaguardas, reagir, Impulsionar ou perder a cobertura revela você.",
      },
      {
        id: "search",
        name: "Procurar",
        en: "Search",
        cost: "quick",
        who: "both",
        run: "search",
        desc: "Procure um personagem Oculto nos Sensores (teste de Sistemas contra a Agilidade dele).",
      },
      {
        id: "activate_quick",
        name: "Ativar (rápida)",
        en: "Quick Activation",
        cost: "quick",
        who: "both",
        run: "log",
        desc: "Use um sistema ou equipamento que custa uma Ação Rápida (veja os botões “Usar” na ficha).",
      },
      {
        id: "prepare",
        name: "Preparar Ação",
        en: "Prepare",
        cost: "quick",
        who: "both",
        run: "log",
        desc: "Escolha outra Ação Rápida e um gatilho (“quando X, então Y”). Até o início do seu próximo turno, ela pode ser feita como reação quando o gatilho acontecer. Depois de preparar, não pode se mover nem fazer outras ações ou reações até o gatilho ou o seu próximo turno.",
      },
      {
        id: "shutdown",
        name: "Desligar",
        en: "Shut Down",
        cost: "quick",
        who: "mech",
        run: "shutdown",
        desc: "Desliga o mech: zera o calor e remove Exposto, encerra efeitos tech (como Mira Travada) e cascata de IA; fica imune a ações tech, mas Atordoado até Ligar.",
      },
      {
        id: "eject",
        name: "Ejetar",
        en: "Eject",
        cost: "quick",
        who: "mech",
        run: "eject",
        desc: "O piloto ejeta e voa 6 espaços. Uso único: o mech fica Prejudicado até o próximo Reparo Total.",
      },
      {
        id: "selfdestruct",
        name: "Autodestruição",
        en: "Self-Destruct",
        cost: "quick",
        who: "mech",
        run: "log",
        desc: "Último recurso: o reator explode no fim do seu próximo turno (ou no fim de um dos seus turnos nas duas rodadas seguintes, à sua escolha). Destrói o mech, mata quem estiver dentro e causa Explosão 2 de 4d6 explosivo; quem passar numa salvaguarda de Agilidade leva metade.",
      },
    ],
  },
  {
    group: "Ações Inteiras",
    actions: [
      {
        id: "barrage",
        name: "Rajada",
        en: "Barrage",
        cost: "full",
        who: "both",
        run: "barrage",
        desc: "Escolha duas montagens e ataque com todas as armas delas (uma montagem com duas armas dispara as duas), ou ataque com uma arma superpesada.",
      },
      {
        id: "fulltech",
        name: "Tech Inteira",
        en: "Full Tech",
        cost: "full",
        who: "both",
        run: "log",
        desc: "Faça duas Tech Rápidas (pode repetir a mesma) ou use um sistema de Tech Inteira.",
      },
      {
        id: "stabilize",
        name: "Estabilizar",
        en: "Stabilize",
        cost: "full",
        who: "both",
        run: "stabilize",
        desc: "Escolha um: resfriar (zera o calor e remove Exposto) ou gastar 1 Reparo para recuperar todo o PV. E mais um: recarregar armas Recarregáveis, remover a queimadura, ou remover uma condição sua ou de um aliado adjacente.",
        npcDesc: "Sem escolhas: zera o calor, remove Exposto e recarrega todas as armas Recarregáveis. (NPCs não têm Reparos.)",
      },
      {
        id: "disengage",
        name: "Desengajar",
        en: "Disengage",
        cost: "full",
        who: "both",
        run: "log",
        desc: "Até o fim do turno você ignora engajamento e seu movimento não provoca reações.",
      },
      {
        id: "improvised",
        name: "Ataque Improvisado",
        en: "Improvised Attack",
        cost: "full",
        who: "both",
        run: "improvised",
        desc: "Ataque corpo a corpo com o que estiver à mão: 1d6 de dano cinético.",
        npcDesc: "Ataque corpo a corpo (+Tier) com dano cinético fixo: 3 / 4 / 6 pelo Tier.",
      },
      {
        id: "activate_full",
        name: "Ativar (inteira)",
        en: "Full Activation",
        cost: "full",
        who: "both",
        run: "log",
        desc: "Use um sistema ou equipamento que custa uma Ação Inteira.",
      },
      {
        id: "skillcheck",
        name: "Teste de Perícia",
        en: "Skill Check",
        cost: "full",
        who: "both",
        run: "log",
        desc: "Uma atividade complexa que não é coberta por outras ações (o Mestre define o atributo e o objetivo): 1d20 + atributo (e gatilho de perícia), sucesso com 10+.",
      },
      {
        id: "bootup",
        name: "Ligar",
        en: "Boot Up",
        cost: "full",
        who: "mech",
        run: "bootup",
        desc: "Religa um mech Desligado.",
      },
      {
        id: "mount",
        name: "Montar / Desmontar",
        en: "Mount / Dismount",
        cost: "full",
        who: "mech",
        run: "log",
        desc: "O piloto entra ou sai do mech adjacente.",
      },
    ],
  },
  {
    group: "Reações (1 por turno)",
    actions: [
      {
        id: "brace",
        name: "Preparar-se",
        en: "Brace",
        cost: "reaction",
        who: "mech",
        run: "log",
        desc: "Ao ser atingido por um ataque e saber o dano: Resistência ao dano, queimadura e calor dele (metade, arredondando para cima). Outros ataques contra você recebem +1 Dificuldade até o fim do seu próximo turno. Sem reações até o fim do seu próximo turno, e nele só uma Ação Rápida (sem Sobrecarga, movimento, protocolos ou ações livres).",
      },
      {
        id: "overwatch",
        name: "Vigilância",
        en: "Overwatch",
        cost: "reaction",
        who: "both",
        run: "overwatch",
        desc: "Quando um hostil começa a se mover dentro da Ameaça de uma arma sua (Ameaça 1 se não indicado), faça imediatamente uma Escaramuça contra ele com essa arma, antes que ele se mova.",
        npcDesc: "Quando um personagem começa a se mover dentro da Ameaça de uma arma do NPC, ele pode fazer uma Escaramuça contra ele. Só uma vez entre os turnos do NPC, salvo indicação.",
      },
    ],
  },
  {
    group: "Ações Livres",
    actions: [
      {
        id: "overcharge",
        name: "Sobrecarga",
        en: "Overcharge",
        cost: "free",
        who: "mech",
        run: "overcharge",
        desc: "Uma vez por turno: ganhe uma Ação Rápida extra. Custa calor, que aumenta a cada uso até o próximo Reparo Total: 1, 1d3, 1d6, 1d6+4.",
      },
      {
        id: "protocol",
        name: "Protocolos",
        en: "Protocol",
        cost: "protocol",
        who: "both",
        run: "log",
        desc: "Sistemas de Protocolo só podem ser ativados no início do turno, antes de qualquer outra ação.",
      },
    ],
  },
];
