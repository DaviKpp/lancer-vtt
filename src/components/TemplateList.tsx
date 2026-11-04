import { useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { NpcSheet } from "../lib/types";
import { useTemplates } from "../obr/hooks";
import { spawnFromTemplate } from "../obr/spawn";
import { templateStore } from "../obr/templates";
import { useApp } from "./AppContext";
import { ImportButton } from "./ImportButton";
import { tr } from "../lib/i18n";
import { ContentPacks } from "./ContentPacks";
import { Portrait } from "./Portrait";

export function TemplateList({ onOpen }: { onOpen: (id: string) => void }) {
  const templates = useTemplates();
  const [filter, setFilter] = useState("");
  const shown = templates.filter((t) =>
    `${t.name} ${t.className} ${t.role} ${t.templates.join(" ")}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <div className="stack">
      <ImportButton mode="npc" />
      <ContentPacks />
      <p className="muted small">
        Os templates ficam salvos neste navegador e valem para todas as suas salas. Adicione cópias deles a um encontro
        por aqui ou pela aba Encontro.
      </p>
      {templates.length > 5 && <input placeholder="Buscar templates…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      {templates.length === 0 && <p className="muted">Nenhum template ainda. Exporte NPCs (ou um encontro inteiro) do COMP/CON e importe aqui.</p>}
      {shown.map((t) => (
        <TemplateCard key={t.id} t={t} onOpen={() => onOpen(t.id)} />
      ))}
    </div>
  );
}

export function SpawnControls({ t, compact }: { t: NpcSheet; compact?: boolean }) {
  const app = useApp();
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const enc = app.room.encounter;
  const spawn = async () => {
    setBusy(true);
    try {
      const made = await spawnFromTemplate(t, count, { id: app.session.playerId, name: app.session.playerName });
      setCount(1);
      await OBR.notification.show(`${made.map((m) => m.name).join(", ")} adicionado(s) a ${enc?.name}.`, "SUCCESS");
    } catch (e) {
      await OBR.notification.show((e as Error).message, "ERROR");
    } finally {
      setBusy(false);
    }
  };
  if (!enc) return compact ? null : <span className="muted small">Crie um encontro para adicionar cópias.</span>;
  return (
    <div className="row gap">
      <div className="stepper">
        <button className="icon-btn" onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="Menos">
          −
        </button>
        <span className="num">{count}</span>
        <button className="icon-btn" onClick={() => setCount((c) => Math.min(20, c + 1))} aria-label="Mais">
          +
        </button>
      </div>
      <button className="btn-small" disabled={busy} onClick={spawn}>
        Adicionar ao encontro
      </button>
    </div>
  );
}

function TemplateCard({ t, onOpen }: { t: NpcSheet; onOpen: () => void }) {
  const app = useApp();
  const live = Object.values(app.room.combatants).filter((c) => c.tpl === t.id).length;
  const s = t.stats;
  return (
    <div className="combatant-card kind-npc">
      <button className="combatant-main" onClick={onOpen}>
        <div className="combatant-name">
          <Portrait src={t.image} size={84} />
          <strong>{t.name}</strong>
          {live > 0 && <span className="badge">{live} na sala</span>}
        </div>
        <div className="muted small">
          {t.className} · T{t.tier}
          {t.role ? ` · ${tr(t.role)}` : ""}
          {t.templates.length ? ` · ${t.templates.join(", ")}` : ""}
        </div>
        {t.warnings.length > 0 && (
          <div className="warn small">
            {t.warnings.length} habilidade(s) sem dados — {t.raw ? "importe um content pack para corrigir" : "importe o arquivo de novo"}
          </div>
        )}
        <div className="muted small mono">
          PV {s.hp} · Arm {s.armor} · Eva {s.evasion} · Def-E {s.edef} · Vel {s.speed} · Ativ {s.activations}
        </div>
      </button>
      <div className="card-actions">
        <SpawnControls t={t} />
        <span className="spacer" />
        <button
          className="btn-small ghost danger"
          onClick={() => {
            if (window.confirm(`Apagar o template "${t.name}"? Os NPCs que já estão na sala continuam.`)) templateStore.remove(t.id);
          }}
        >
          Apagar
        </button>
      </div>
    </div>
  );
}
