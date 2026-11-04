# LANCER VTT — extensão para o Owlbear Rodeo

Rode encontros de LANCER no Owlbear Rodeo: importe pilotos e NPCs do COMP/CON, acompanhe os mechs, vincule-os a tokens, mostre PV/condições sobre os tokens e role ataques contra alvos.

Feito com Vite, React e TypeScript usando `@owlbear-rodeo/sdk`. Os dados do livro básico (frames, armas, sistemas, mods, talentos, tags e condições) vêm de `@massif/lancer-data`, os mesmos que o COMP/CON usa.

## Começando

```bash
npm install
npm run dev          # servidor em http://localhost:5173
```

No Owlbear Rodeo, abra seu perfil → **Extensions → Add Custom Extension** e cole:

```
http://localhost:5173/manifest.json
```

Ative a extensão numa sala. O botão LANCER aparece na barra de ações, no canto superior esquerdo.

Para publicar: `npm run build` e hospede a pasta `dist/` em qualquer host estático (Vercel, Netlify, GitHub Pages, Cloudflare Pages). Depois adicione `https://seu-host/manifest.json` no Owlbear.

## Funcionalidades

### Jogadores
- **Importar piloto do COMP/CON** (Piloto → Exportar → JSON). Se o piloto tiver vários mechs, você escolhe quais adicionar.
- **Só os próprios mechs:** cada jogador vê a ficha completa apenas dos mechs que importou.
- **Ficha:** frame, fabricante, piloto (NL, Grit, CASE, perícias, talentos, bônus de núcleo, licenças, equipamento), atributos, montagens e armas, sistemas e ações, sistema núcleo e características do frame.
- **Marcadores:** PV, sobrescudo, calor, estrutura, estresse, queimadura, reparos e poder do núcleo. "Receber dano" aplica armadura, AP, resistência e sobrescudo.
- **Condições e estados** (Emperrado, Mira Travada, Caído, Exposto...). Zona de Perigo liga sozinha com metade do calor.
- **Ataques e ataques tech** contra um alvo, com dados de precisão/dificuldade, crítico em 20+, dano automático e Confiável. Pela ficha ou direto pela lista do encontro (**⌖ Atacar**).
- **Vincular a um token:** selecione o token e clique em **Vincular token** (na ficha ou na linha do encontro), ou clique com o botão direito no token → **Vincular ficha LANCER**.

### Ações do turno
- **Marcador de ações** em cada ficha e na lista do encontro: Movimento, Rápida (2), Inteira, Reação (1 por rodada) e Sobrecarga. Clique para corrigir; "Novo turno" libera tudo menos a reação. "Fim do turno" no encontro também libera; "Próxima rodada" libera inclusive a reação.
- **Mapeamento automático:** atacar com uma arma gasta uma Ação Rápida (Escaramuça) — superpesada gasta a Ação Inteira (Rajada); ataque tech gasta uma Rápida. Sistemas e habilidades mostram etiquetas de custo no título (ex.: **Ação Rápida**, também para implantáveis, que são implantados como Ação Rápida). Ações de sistemas, habilidades de NPC e o Poder do Núcleo mostram o custo (Ação Rápida, Ação Inteira, Reação, Protocolo, Livre) e têm botão **Usar**, que marca o custo e registra no log.
- **Guia rápido de ações** (aba **Ações**, seção "Ações do turno" na ficha e "📖 Ações" no encontro): todas as ações básicas de LANCER com custo e resumo, indicando quais ainda estão disponíveis. Escaramuça, Rajada, Vigilância, Invadir, Investida, Agarrar e Ataque Improvisado abrem a rolagem; Travar Mira aplica a condição no alvo; Esconder-se aplica Oculto; Estabilizar aplica a escolha (resfriar ou 1 Reparo + recarregar/queimadura/condição); Sobrecarga rola o calor crescente (1 → 1d3 → 1d6 → 1d6+4).
- O marcador avisa quando uma ação não está disponível, mas não bloqueia: a mesa sempre decide.
- **Reações:** no máximo uma por turno (de qualquer personagem; a Gorgon pode usar 2). Cada reação tem seus usos (normalmente 1/rodada), que voltam no início do turno do próprio personagem. Cópias da mesma reação (ex.: vários drones) somam usos. O botão **↯ Reações** no encontro mostra a "mão" de reações (Preparar, Vigilância e as de sistemas/habilidades) com usos restantes.
- **Turnos:** **Iniciar turno** marca quem está agindo (destaque na lista), libera ações e repõe as reações; usar uma ação também inicia o turno automaticamente. **Fim do turno** gasta a ativação.
- **Preparar (Brace):** até o fim do próximo turno do personagem, ataques contra ele recebem +1 Dificuldade automaticamente e ele não pode reagir; no turno seguinte só uma Ação Rápida. Resistência reduz o dano pela metade, arredondando para cima.
- **Vigilância:** escolha a arma e faça a Escaramuça imediata, sem gastar Ação Rápida.
- **Rajada:** escolha duas montagens (ou uma com arma superpesada); todas as armas delas atacam.

### Efeitos no acerto
- Ataques e ataques tech mostram o que fazem no acerto (antes de rolar e no resultado).
- Condições impostas sem salvaguarda são aplicadas automaticamente no alvo. Se houver salvaguarda ou escolha do alvo, o resultado mostra botões **Aplicar <condição>**.
- **Invadir:** escolha a opção de invasão (Fragmentar Sinal ou as dos seus sistemas); no acerto o alvo recebe +2 de calor e as condições da opção.
- **Queimadura:** dano de queimadura e a tag Queimadura X marcam a queimadura no alvo automaticamente; o PV é descontado quando o mestre aplica o dano.
- Tag Calor X (Alvo) aplica o calor no acerto.

### Mestre
- **Lancers:** vê todos os mechs e pode importar pilotos em nome de um jogador.
- **Templates de NPC:** biblioteca de NPCs importados do COMP/CON (NPCs avulsos ou um encontro inteiro), salva no navegador do mestre e válida para todas as salas.
- **Content packs (.lcp):** importe os mesmos `.lcp` que você usa no COMP/CON (ex.: *Lancer CORE NPCs*) para completar exportações antigas que só trazem IDs.
- **Encontro:** cada linha tem **📋 Habilidades** com armas, sistemas e habilidades do NPC (ou mech). Crie, adicione lancers e quantas cópias quiser de cada template ("Bombard 1", "Bombard 2"...), inicie e acompanhe rodadas e ativações (iniciativa "pipoca"). Cada linha tem **⌖ Atacar**, **⛓ Vincular token** e **Localizar**. Remover um NPC apaga a cópia; encerrar o encontro apaga todas as cópias de NPC.
- **Rolagens:** aplique o dano de uma rolagem ao alvo com um clique.

### Sobre os tokens (HUD)
Desenhado localmente para cada pessoa:

| | Acima do token | Abaixo do token |
|---|---|---|
| Mech de jogador | PV (barra + número) e condições — todos veem | Calor (barra), Estrutura e Estresse — todos veem |
| NPC | PV só para o mestre; condições para todos | Calor, Estrutura e Estresse só para o mestre |

## Arquivos do COMP/CON suportados

| Arquivo | Observações |
|---|---|
| Exportação de piloto v3 (atual) | Completo. Os dados dos itens vêm embutidos, então LCPs funcionam. |
| Exportação de piloto v2 (antiga) | Resolvida com os dados do livro básico ou dos `.lcp` importados. |
| Exportação de NPC v3 ("unit") | Completo, com templates e textos por tier `{2/3/4}`. |
| Exportação de NPC v2 | Completo se o `.lcp` correspondente estiver importado; senão só os nomes das habilidades. |
| Exportação de encontro v3 | Importa todos os NPCs como templates. |

## Onde os dados ficam

O Owlbear limita os metadados da sala a **16 kB no total**, então:

| Dado | Onde | Por quê |
|---|---|---|
| Estado ao vivo (PV, calor, estrutura, condições, vínculo, ativações) | Metadados da sala, uma chave por combatente | Pequeno e sincronizado; ~35 combatentes cabem |
| Encontro | Metadados da sala | Pequeno |
| Fichas completas | Navegador de quem importou; enviadas ao mestre por broadcast | Grandes demais para a sala |
| Templates de NPC e content packs | Navegador do mestre | Só o mestre precisa |
| HUD dos tokens | Itens locais (cada pessoa desenha o seu) | Permite mostrar coisas diferentes para mestre e jogadores |

A privacidade é feita pela interface: tecnicamente, os dados da sala podem ser lidos por qualquer cliente na sala.

## Aproximações de regras (v0.4)

- Atributos usam os valores calculados pelo COMP/CON quando a exportação os traz; senão são derivados do frame, CASE, Grit e bônus numéricos. Use **Editar máximos** para corrigir.
- No crítico, cada rolagem de dano é feita duas vezes e fica a maior.
- Dano além de 0 PV é descartado; o calor excedente continua após o estresse.
- **Destruição de equipamento:** no Trauma de Sistema, o resultado mostra as montagens (1–3) ou os sistemas (4–6) para o dono ou o mestre escolher o que foi destruído (se não houver, oferece a outra opção). Itens destruídos ficam marcados, saem das listas de ataque, Rajada e reações, e podem ser reparados pelo botão **Reparar** na ficha (também há **Destruir** manual em cada montagem, sistema e habilidade de NPC).
- Testes de estrutura e superaquecimento são rolados automaticamente quando o personagem (com mais de 1 de estrutura/estresse) marca dano de estrutura ou estresse: 1d6 por ponto já perdido, vale o menor, consultando a tabela. Prejudicado, Atordoado e Exposto são aplicados sozinhos; destruição de armas/sistemas e testes de Casco/Engenharia ficam com a mesa.
- Nomes de itens e textos de efeito do COMP/CON / lancer-data ficam no idioma original.

## Estrutura do projeto

```
public/manifest.json       Manifesto da extensão
index.html → src/main.tsx  Popover principal
background.html → src/background.ts   Menus de contexto + HUD dos tokens
link.html → src/link.tsx   Janela para vincular token a uma ficha
src/parsers/               Leitura de pilotos / NPCs / encontros do COMP/CON
src/lib/                   Tipos, compêndio, .lcp, dados, regras, tradução
src/obr/                   Estado da sala, sincronização, templates, HUD
src/components/            Interface em React
```

## Licenças

`@massif/lancer-data` é GPL-3.0-or-later. LANCER é © Massif Press. Esta é uma ferramenta de fã não oficial. Content packs (`.lcp`) não fazem parte do projeto: cada mestre importa os seus.
