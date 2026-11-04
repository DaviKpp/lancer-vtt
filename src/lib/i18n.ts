// Portuguese (BR) labels for LANCER game terms that come from the data files.
// Item names and effect texts from COMP/CON / lancer-data stay in their original language.

const TERMS: Record<string, string> = {
  // damage
  Kinetic: "Cinético",
  Energy: "Energia",
  Explosive: "Explosivo",
  Burn: "Queimadura",
  Heat: "Calor",
  Variable: "Variável",
  Bonus: "Bônus",
  // ranges
  Range: "Alcance",
  Threat: "Ameaça",
  Blast: "Explosão",
  Burst: "Pulso",
  Cone: "Cone",
  Line: "Linha",
  // weapon sizes / mounts
  Main: "Principal",
  Heavy: "Pesada",
  Aux: "Auxiliar",
  Auxiliary: "Auxiliar",
  Superheavy: "Superpesada",
  Flex: "Flexível",
  Integrated: "Integrada",
  "Main/Aux": "Principal/Auxiliar",
  "Aux/Aux": "Auxiliar/Auxiliar",
  "Improved Armament": "Armamento Aprimorado",
  "Integrated Weapon": "Arma Integrada",
  "Superheavy Mounting": "Montagem Superpesada",
  "Bonus Mount": "Montagem Bônus",
  // weapon types
  Rifle: "Fuzil",
  Cannon: "Canhão",
  Launcher: "Lançador",
  CQB: "CQB",
  Nexus: "Nexus",
  Melee: "Corpo a corpo",
  // activations
  Quick: "Rápida",
  Full: "Inteira",
  Protocol: "Protocolo",
  Reaction: "Reação",
  Free: "Livre",
  "Quick Tech": "Tech Rápida",
  "Full Tech": "Tech Inteira",
  Invade: "Invadir",
  Passive: "Passiva",
  Active: "Ativa",
  Deployable: "Implantável",
  Drone: "Drone",
  None: "Nenhuma",
  // uses
  Encounter: "Encontro",
  Round: "Rodada",
  Turn: "Turno",
  Mission: "Missão",
  // NPC feature types
  weapon: "Arma",
  tech: "Tech",
  system: "Sistema",
  trait: "Característica",
  reaction: "Reação",
  // NPC roles
  artillery: "Artilharia",
  controller: "Controlador",
  defender: "Defensor",
  striker: "Atacante",
  support: "Suporte",
  biological: "Biológico",
  // misc system types
  Shield: "Escudo",
  AI: "IA",
  System: "Sistema",
  Flight: "Voo",
  Mech: "Mech",
  Vehicle: "Veículo",
  Ship: "Nave",
  Squad: "Esquadrão",
  Human: "Humano",
};

/** Translates a single term, or each word of a compound like "Main Melee" / "Quick Tech". */
export function tr(term: string | undefined | null): string {
  if (!term) return "";
  if (TERMS[term]) return TERMS[term];
  return term
    .split(" ")
    .map((w) => TERMS[w] ?? w)
    .join(" ");
}

/** Short Portuguese summaries of the core statuses/conditions (our own wording). */
export const STATUS_PT: Record<string, { name: string; terse: string }> = {
  immobilized: { name: "Imobilizado", terse: "Não pode fazer movimentos voluntários." },
  impaired: { name: "Prejudicado", terse: "+1 Dificuldade em ataques, salvaguardas e testes de perícia." },
  jammed: {
    name: "Emperrado",
    terse: "Sem comunicação; só ataca com ataque improvisado, agarrar ou investida; sem reações nem ações tech.",
  },
  lockon: { name: "Mira Travada", terse: "Hostis podem consumir a Mira Travada para +1 Precisão no próximo ataque contra ele." },
  shredded: { name: "Dilacerado", terse: "Não se beneficia de Armadura nem de Resistência." },
  slow: { name: "Lento", terse: "Só o movimento padrão no próprio turno; não pode Impulsionar nem usar movimentos especiais." },
  stunned: {
    name: "Atordoado",
    terse: "Não se move, não age nem Sobrecarrega; Evasão máx. 5; falha em testes e salvaguardas de Casco e Agilidade.",
  },
  dangerzone: { name: "Zona de Perigo", terse: "Calor na metade da capacidade ou acima." },
  downandout: { name: "Fora de Combate", terse: "Piloto inconsciente e Atordoado; qualquer dano adicional o mata." },
  engaged: { name: "Engajado", terse: "Adjacente a um hostil: +1 Dificuldade em ataques à distância." },
  exposed: { name: "Exposto", terse: "Dano cinético, explosivo e de energia recebido é dobrado." },
  hidden: { name: "Oculto", terse: "Não pode ser alvo de ataques ou ações hostis e não causa engajamento." },
  invisible: { name: "Invisível", terse: "Ataques contra ele têm 50% de chance de errar antes da rolagem." },
  prone: { name: "Caído", terse: "Ataques contra ele ganham +1 Precisão; fica Lento e em terreno difícil." },
  "shut-down": { name: "Desligado", terse: "Atordoado indefinidamente; calor zerado e imune a ações tech." },
};
