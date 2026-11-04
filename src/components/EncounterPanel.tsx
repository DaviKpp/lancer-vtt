import { useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { CombatantState, EncounterState } from "../lib/types";
import { canView } from "../lib/combatant";
import { uid } from "../lib/util";
import { linkToken, patchCombatant, patchCombatants, setEncounter } from "../obr/room";
import { useApp } from "./AppContext";
import { MiniBars } from "./CombatantList";
import { QuickHp } from "./QuickHp";
import { StatusChips } from "./Conditions";
import { SpawnControls } from "./TemplateList";
import { deleteInstances } from "../obr/spawn";
import { useTemplates } from "../obr/hooks";
import { AttackPanel, type AttackSpec } from "./AttackPanel";
import { attacksFor } from "./attackSpecs";
import { ActionGuide } from "./ActionGuide";
import { AbilitySummary } from "./AbilitySummary";
import { BarragePanel } from "./BarragePanel";
import { TurnTracker } from "./TurnTracker";
import { endTurn, startTurn } from "../obr/turns";
import { ReactionPanel } from "./ReactionPanel";

export function EncounterPanel() {
  const app = useApp();
  const enc = app.room.encounter;
  const [name, setName] = useState("");
  const [toAdd, setToAdd] = useState("");

  if (!enc) {
    return (
      <div className="stack">
        <h3>Encontro</h3>
        {app.isGM ? (
          <>
            <p className="muted">
              Crie um encontro, adicione lancers e NPCs e depois inicie para acompanhar rodadas e ativações.
            </p>
            <div className="row gap">
              <input placeholder="Nome do encontro" value={name} onChange={(e) => setName(e.target.value)} />
              <button
                className="btn-primary"
                onClick={() =>
                  setEncounter({ id: uid(), name: name.trim() || "Encontro", status: "setup", round: 0, combatants: [] })
                }
              >
                Criar
              </button>
            </div>
          </>
        ) : (
          <p className="muted">Nenhum encontro em andamento. O mestre vai iniciar um.</p>
        )}
      </div>
    );
  }

  const members = enc.combatants.map((id) => app.room.combatants[id]).filter((c): c is CombatantState => !!c);
  const available = Object.values(app.room.combatants).filter((c) => !enc.combatants.includes(c.id) && c.kind === "mech");
  const update = (patch: Partial<EncounterState>) => setEncounter({ ...enc, ...patch });

  const resetActivations = async () => {
    // new round: activations and every action (including reactions) refresh
    await patchCombatants(Object.fromEntries(members.map((c) => [c.id, { used: 0, ac: {} }])));
  };

  const start = async () => {
    await resetActivations();
    await update({ status: "active", round: 1 });
  };

  const nextRound = async () => {
    await resetActivations();
    await update({ round: enc.round + 1 });
  };

  const end = async () => {
    const npcIds = members.filter((c) => c.kind === "npc").map((c) => c.id);
    if (
      !window.confirm(
        `Encerrar ${enc.name}?` +
          (npcIds.length ? ` Os ${npcIds.length} NPC(s) dele serão removidos; os lancers continuam na sala.` : ""),
      )
    )
      return;
    await patchCombatants(
      Object.fromEntries(members.map((c) => [c.id, { used: 0, ac: {}, ocn: 0, rx: undefined, ru: undefined, br: undefined }])),
    );
    await deleteInstances(npcIds, true);
  };

  const add = async (ids: string[]) => {
    const next = [...enc.combatants, ...ids.filter((id) => !enc.combatants.includes(id))];
    await update({ combatants: next });
    if (enc.status === "active") await patchCombatants(Object.fromEntries(ids.map((id) => [id, { used: 0 }])));
  };

  // NPCs are encounter instances of a template, so removing one deletes it; lancers just leave the encounter.
  const removeMember = async (id: string) => {
    const c = app.room.combatants[id];
    if (c?.kind === "npc") {
      if (!window.confirm(`Remover ${c.name}? Esta cópia do NPC será apagada.`)) return;
      await deleteInstances([id]);
    } else await update({ combatants: enc.combatants.filter((x) => x !== id) });
  };

  const lancers = members.filter((c) => c.kind === "mech");
  const npcs = members.filter((c) => c.kind === "npc");
  const allDone = members.length > 0 && members.every((c) => c.used >= c.activations);

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h3>{enc.name}</h3>
          <div className="muted small">{enc.status === "active" ? `Rodada ${enc.round}` : "Em preparação"}</div>
        </div>
        {app.isGM && (
          <div className="row gap">
            {enc.status === "setup" ? (
              <button className="btn-primary" disabled={!members.length} onClick={start}>
                Iniciar
              </button>
            ) : (
              <button className={allDone ? "btn-primary" : "btn-small"} onClick={nextRound}>
                Próxima rodada
              </button>
            )}
            <button className="btn-small ghost danger" onClick={end}>
              Encerrar
            </button>
          </div>
        )}
      </div>

      {app.isGM && <AddFromTemplate />}

      {app.isGM && available.length > 0 && (
        <div className="row gap wrap">
          <select value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
            <option value="">Adicionar lancer…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="btn-small" disabled={!toAdd} onClick={() => add([toAdd]).then(() => setToAdd(""))}>
            Adicionar
          </button>
          <button className="btn-small ghost" onClick={() => add(available.map((c) => c.id))}>
            Adicionar todos os lancers
          </button>
        </div>
      )}

      <Group title="Lancers" list={lancers} active={enc.status === "active"} onRemove={app.isGM ? removeMember : undefined} />
      <Group
        title="Hostis e outros"
        list={npcs}
        active={enc.status === "active"}
        onRemove={app.isGM ? removeMember : undefined}
      />
      {enc.status === "active" && (
        <p className="muted small">
          LANCER usa iniciativa "pipoca": depois que um personagem age, ele escolhe quem age em seguida (alternando os
          lados quando possível).
        </p>
      )}
    </div>
  );
}

function Group({
  title,
  list,
  active,
  onRemove,
}: {
  title: string;
  list: CombatantState[];
  active: boolean;
  onRemove?: (id: string) => void;
}) {
  if (!list.length) return null;
  return (
    <div className="stack">
      <div className="mount-head">{title}</div>
      {list.map((c) => (
        <EncounterRow key={c.id} c={c} active={active} onRemove={onRemove} />
      ))}
    </div>
  );
}

function EncounterRow({ c, active, onRemove }: { c: CombatantState; active: boolean; onRemove?: (id: string) => void }) {
  const app = useApp();
  const [panel, setPanel] = useState<"none" | "attacks" | "guide" | "abilities" | "reactions">("none");
  const [attack, setAttack] = useState<AttackSpec | null>(null);
  const [barrage, setBarrage] = useState(false);
  const [overwatch, setOverwatch] = useState(false); // weapon picker for a Vigilância (no action cost)
  const visible = canView(c, app.session);
  const editable = visible;
  const done = c.used >= c.activations;
  const acting = active && app.room.encounter?.actor === c.id;
  const sheet = visible ? app.sheetFor(c.id) : undefined;

  const linkSelected = async () => {
    const sel = await OBR.player.getSelection();
    if (!sel || sel.length !== 1) {
      await OBR.notification.show("Selecione exatamente um token no mapa e clique em Vincular.", "WARNING");
      return;
    }
    const [item] = await OBR.scene.items.getItems(sel);
    if (!item || (item.layer !== "CHARACTER" && item.layer !== "MOUNT")) {
      await OBR.notification.show("Só tokens de personagem ou montaria podem ser vinculados.", "WARNING");
      return;
    }
    await linkToken(c.id, item.id);
    await OBR.notification.show(`${c.name} vinculado a ${item.name || "token"}.`, "SUCCESS");
  };

  return (
    <div className={`enc-row ${done && active ? "done" : ""} ${acting ? "acting" : ""} kind-${c.kind}`}>
      <div className="enc-top">
        <div className="enc-main">
          <button className="link-btn" onClick={() => visible && app.openSheet(c.id)} disabled={!visible}>
            <strong>{c.name}</strong>
            {c.tokenId && (
              <span className="badge" title="Vinculado a um token">
                ⛓
              </span>
            )}
          </button>
          <div className="muted small">{visible ? c.sub : c.kind === "npc" ? "Hostil" : c.ownerName}</div>
          {visible && <MiniBars c={c} />}
          {editable && <QuickHp c={c} />}
          <StatusChips c={c} />
          {visible && active && <TurnTracker c={c} editable={editable} compact />}
          {!visible && c.structure === 0 && <span className="badge badge-off">Destruído</span>}
        </div>
        <div className="enc-side">
          {active && (
            <div className="activations" title="Ativações usadas nesta rodada">
              {Array.from({ length: Math.max(1, c.activations) }, (_, i) => (
                <button
                  key={i}
                  className={`act-pip ${i < c.used ? "used" : ""}`}
                  disabled={!editable}
                  onClick={() => patchCombatant(c.id, { used: i < c.used ? i : i + 1 })}
                  aria-label={i < c.used ? "Marcar ativação como não usada" : "Marcar ativação como usada"}
                />
              ))}
            </div>
          )}
          {active && editable && !done && !acting && (
            <button className="btn-small ghost" onClick={() => startTurn(c.id)} title="Começa o turno: libera ações e repõe as reações">
              Iniciar turno
            </button>
          )}
          {active && editable && !done && acting && (
            <button className="btn-small" onClick={() => endTurn(c.id)}>
              Fim do turno
            </button>
          )}
          {onRemove && (
            <button className="icon-btn" onClick={() => onRemove(c.id)} aria-label="Remover do encontro">
              ×
            </button>
          )}
        </div>
      </div>
      {editable && (
        <div className="row gap wrap enc-actions">
          {sheet && (
            <button
              className={`btn-small ${panel === "attacks" ? "" : "ghost"}`}
              onClick={() => {
                setPanel(panel === "attacks" ? "none" : "attacks");
                setAttack(null);
                setBarrage(false);
                setOverwatch(false);
              }}
            >
              ⌖ Atacar
            </button>
          )}
          {sheet && (
            <button
              className={`btn-small ${panel === "abilities" ? "" : "ghost"}`}
              onClick={() => {
                setPanel(panel === "abilities" ? "none" : "abilities");
                setAttack(null);
              }}
              title="Armas, sistemas e habilidades"
            >
              📋 Habilidades
            </button>
          )}
          <button
            className={`btn-small ${panel === "reactions" ? "" : "ghost"}`}
            onClick={() => {
              setPanel(panel === "reactions" ? "none" : "reactions");
              setAttack(null);
            }}
            title="Reações disponíveis (use no turno de qualquer personagem)"
          >
            ↯ Reações
          </button>
          <button
            className={`btn-small ${panel === "guide" ? "" : "ghost"}`}
            onClick={() => {
              setPanel(panel === "guide" ? "none" : "guide");
              setAttack(null);
            }}
          >
            📖 Ações
          </button>
          {app.sceneReady && (
            <button className="btn-small ghost" onClick={linkSelected} title="Vincular o token selecionado no mapa">
              ⛓ {c.tokenId ? "Revincular" : "Vincular token"}
            </button>
          )}
          {c.tokenId && app.sceneReady && (
            <button className="btn-small ghost" onClick={() => OBR.player.select([c.tokenId as string], true)}>
              Localizar
            </button>
          )}
          {!sheet && <span className="muted small">Ficha não disponível neste dispositivo.</span>}
        </div>
      )}
      {panel === "attacks" && sheet && !attack && !barrage && (
        <div className="quick-attacks">
          {overwatch ? (
            <span className="small muted">Vigilância — escolha a arma (Escaramuça imediata, sem custo de ação):</span>
          ) : (
            <button className="btn-small" onClick={() => setBarrage(true)} title="Ação Inteira: duas montagens">
              ⌖⌖ Rajada
            </button>
          )}
          {attacksFor(sheet)
            .filter((a) => !overwatch || (a.spec.kind === "attack" && a.spec.cost !== "full"))
            .map((a) => (
              <button
                key={a.key}
                className="btn-small"
                onClick={() =>
                  setAttack(
                    overwatch ? { ...a.spec, cost: undefined, costLabel: undefined, label: `${a.spec.label} (Vigilância)` } : a.spec,
                  )
                }
              >
                {a.spec.kind === "tech" ? "⚡" : "⌖"} {a.spec.label}
              </button>
            ))}
        </div>
      )}
      {panel === "attacks" && sheet && barrage && (
        <BarragePanel
          c={c}
          sheet={sheet}
          onClose={() => setBarrage(false)}
          onDone={() => {
            setBarrage(false);
            setPanel("none");
          }}
        />
      )}
      {panel === "abilities" && sheet && <AbilitySummary sheet={sheet} c={c} editable={editable} />}
      {panel === "guide" && <ActionGuide c={c} sheet={sheet} editable={editable} />}
      {panel === "reactions" && (
        <ReactionPanel
          c={c}
          sheet={sheet}
          editable={editable}
          onOverwatch={() => {
            setPanel("attacks");
            setAttack(null);
            setBarrage(false);
            setOverwatch(true);
          }}
        />
      )}
      {panel === "attacks" && attack && (
        <AttackPanel
          attacker={c}
          spec={attack}
          onClose={() => {
            setAttack(null);
          }}
          onDone={() => {
            setAttack(null);
            setOverwatch(false);
            setPanel("none");
          }}
        />
      )}
    </div>
  );
}

function AddFromTemplate() {
  const templates = useTemplates();
  const [id, setId] = useState("");
  const t = templates.find((x) => x.id === id);
  if (!templates.length)
    return <p className="muted small">Importe templates de NPC na aba Templates para adicionar hostis.</p>;
  return (
    <div className="row gap wrap">
      <select value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">Adicionar NPCs de um template…</option>
        {templates.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name} ({x.className} T{x.tier})
          </option>
        ))}
      </select>
      {t && <SpawnControls key={t.id} t={t} />}
    </div>
  );
}
