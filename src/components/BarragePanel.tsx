import { useMemo, useState } from "react";
import type { CombatantState, RollResult, Sheet } from "../lib/types";
import { tr } from "../lib/i18n";
import { takeAction } from "../obr/actions";
import { performAttack } from "../obr/attack";
import { autoModifiers, COVER_LABEL, isRanged, netLabel, type Cover } from "../lib/modifiers";
import type { AttackSpec } from "./AttackPanel";
import { mechWeaponSpec, npcFeatureSpec } from "./attackSpecs";
import { useApp } from "./AppContext";
import { RollCard } from "./RollLogView";
import { notify } from "../obr/toast";

interface MountGroup {
  key: string;
  name: string;
  weapons: AttackSpec[];
  superheavy: boolean;
}

/** Mounts (mechs) or individual weapons (NPCs) that can take part in a Barrage. */
export function barrageGroups(sheet: Sheet): MountGroup[] {
  if (sheet.kind === "mech") {
    return sheet.mounts
      .map((m, i) => {
        const weapons = m.weapons.filter((w) => !w.destroyed && w.damage.length + w.range.length > 0);
        return {
          key: `m${i}`,
          name: `Montagem ${tr(m.name)}`,
          weapons: weapons.map((w) => mechWeaponSpec(w, sheet)),
          superheavy: weapons.some((w) => /superheavy/i.test(w.mount)),
        };
      })
      .filter((g) => g.weapons.length);
  }
  return sheet.features
    .filter((f) => f.type === "weapon" && !f.destroyed)
    .map((f) => ({
      key: f.uid,
      name: f.name,
      weapons: [npcFeatureSpec(f, sheet)],
      superheavy: /superheavy/i.test(f.weaponType ?? ""),
    }));
}

/**
 * Barrage (Ação Inteira): pick two mounts — or one with a superheavy weapon — and attack
 * with every weapon on them. Each weapon rolls separately, with its own target if wanted.
 */
export function BarragePanel({
  c,
  sheet,
  onClose,
  onDone,
  charge = true,
}: {
  c: CombatantState;
  sheet: Sheet;
  onClose: () => void;
  /** Called once all damaging attacks are applied (defaults to onClose). */
  onDone?: () => void;
  /** Spend the full action when rolling (false if it was already spent). */
  charge?: boolean;
}) {
  const app = useApp();
  const groups = useMemo(() => barrageGroups(sheet), [sheet]);
  const targets = app.targetsFor(c.id);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const [perWeapon, setPerWeapon] = useState<Record<string, string>>({});
  const [acc, setAcc] = useState(0);
  const [diff, setDiff] = useState(0);
  const [bonusDamage, setBonusDamage] = useState("");
  const [cover, setCover] = useState<Cover>("none");
  const [consumeLockOn, setConsumeLockOn] = useState(true);
  const [results, setResults] = useState<RollResult[]>([]);
  const [appliedIds, setAppliedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [charged, setCharged] = useState(!charge);

  const chosen = groups.filter((g) => selected.includes(g.key));
  const hasSuperheavy = chosen.some((g) => g.superheavy);
  const max = hasSuperheavy ? 1 : 2;
  const ready = chosen.length > 0 && (hasSuperheavy ? chosen.length === 1 : chosen.length <= 2);

  const toggle = (g: MountGroup) => {
    setSelected((cur) => {
      if (cur.includes(g.key)) return cur.filter((k) => k !== g.key);
      if (g.superheavy) return [g.key]; // a superheavy weapon is the whole barrage
      const keep = cur.filter((k) => !groups.find((x) => x.key === k)?.superheavy);
      return [...keep, g.key].slice(-2);
    });
  };

  const attacks = chosen.flatMap((g) => g.weapons.map((spec, i) => ({ id: `${g.key}:${i}`, group: g.name, spec })));

  const roll = async () => {
    setBusy(true);
    try {
      if (!charged) {
        await takeAction(c, "full", "Rajada", { id: app.session.playerId, name: app.session.playerName }, {
          detail: chosen.map((g) => g.name).join(" + "),
        });
        setCharged(true);
      }
      const out: RollResult[] = [];
      for (const [i, a] of attacks.entries()) {
        // automatic modifiers (conditions, cover, weapon tags) are applied per weapon
        const r = await performAttack(c.id, a.spec, {
          targetId: perWeapon[a.id] || target || undefined,
          manual: acc - diff,
          cover,
          consumeLockOn,
          // bonus damage only on the first attack
          bonusDamage: i === 0 ? bonusDamage.trim() || undefined : undefined,
          label: `${a.spec.label} (Rajada)`,
          by: { id: app.session.playerId, name: app.session.playerName },
        });
        if (r) out.push(r);
      }
      setResults(out);
    } catch (e) {
      await notify((e as Error).message, "ERROR");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="attack-panel">
      <div className="attack-head">
        <strong>
          Rajada <span className="badge cost-full">Ação Inteira</span>
        </strong>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar">
          ×
        </button>
      </div>
      <span className="muted small">
        Escolha {sheet.kind === "mech" ? "duas montagens" : "duas armas"} (ou uma com arma superpesada). Todas as armas das
        montagens escolhidas atacam.
      </span>

      <div className="stack barrage-mounts">
        {groups.map((g) => {
          const on = selected.includes(g.key);
          return (
            <label key={g.key} className={`check-row barrage-mount ${on ? "on" : ""}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(g)} />
              <span>
                <strong>{g.name}</strong>
                {g.superheavy && <span className="badge">Superpesada</span>}
                <span className="muted small">
                  {" "}
                  — {g.weapons.map((w) => w.label).join(" + ")}
                </span>
              </span>
            </label>
          );
        })}
        {!groups.length && <span className="muted small">Nenhuma arma disponível.</span>}
        <span className="muted small">
          {selected.length}/{max} selecionada(s)
        </span>
      </div>

      {attacks.length > 0 && (
        <div className="form-grid">
          <label>Alvo</label>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— sem alvo —</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.kind === "npc" ? " (NPC)" : ""}
              </option>
            ))}
          </select>
          {attacks.length > 1 &&
            attacks.map((a) => (
              <FragmentRow key={a.id} label={a.spec.label}>
                <select value={perWeapon[a.id] ?? ""} onChange={(e) => setPerWeapon((p) => ({ ...p, [a.id]: e.target.value }))}>
                  <option value="">mesmo alvo</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </FragmentRow>
            ))}
          {attacks.some((a) => isRanged(a.spec)) && (
            <>
              <label>Cobertura</label>
              <select value={cover} onChange={(e) => setCover(e.target.value as Cover)}>
                {(Object.keys(COVER_LABEL) as Cover[]).map((k) => (
                  <option key={k} value={k}>
                    {COVER_LABEL[k]}
                  </option>
                ))}
              </select>
            </>
          )}
          {app.room.combatants[target]?.st?.includes("lockon") && (
            <>
              <label>Mira Travada</label>
              <label className="check">
                <input type="checkbox" checked={consumeLockOn} onChange={(e) => setConsumeLockOn(e.target.checked)} /> Consumir
                no 1º ataque (+1 Precisão)
              </label>
            </>
          )}
          <label>Automático</label>
          <div className="auto-mods">
            {attacks.map((a) => {
              const t = app.room.combatants[perWeapon[a.id] || target];
              const mods = autoModifiers(a.spec, app.room.combatants[c.id] ?? c, t, cover, consumeLockOn).filter((m) => m.value !== 0);
              const net = mods.reduce((x, m) => x + m.value, 0);
              return (
                <span key={a.id} className={`mod-chip ${net > 0 ? "acc" : net < 0 ? "diff" : ""}`} title={mods.map((m) => m.label).join(", ")}>
                  {a.spec.label}: {netLabel(net)}
                </span>
              );
            })}
          </div>
          <label>+ Precisão</label>
          <Counter value={acc} onChange={setAcc} />
          <label>+ Dificuldade</label>
          <Counter value={diff} onChange={setDiff} />
          <label>Dano bônus</label>
          <input placeholder="ex.: 1d6 (só no 1º ataque)" value={bonusDamage} onChange={(e) => setBonusDamage(e.target.value)} />
        </div>
      )}

      <button className="btn-primary wide" disabled={!ready || busy} onClick={roll}>
        {attacks.length ? `Rolar ${attacks.length} ataque${attacks.length > 1 ? "s" : ""}` : "Escolha as montagens"}
      </button>
      {results.map((r) => (
        <RollCard
          key={r.id}
          r={r}
          onApplied={() => {
            // close once every attack that dealt damage has been applied
            const pending = results.filter((x) => (x.damage ?? []).some((d) => d.amount > 0) && x.id !== r.id && !appliedIds.includes(x.id));
            setAppliedIds((a) => [...a, r.id]);
            if (!pending.length) (onDone ?? onClose)();
          }}
        />
      ))}
    </div>
  );
}

function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <label className="weapon-target" title={label}>
        ↳ {label}
      </label>
      {children}
    </>
  );
}

function Counter({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button className="icon-btn" onClick={() => onChange(Math.max(0, value - 1))}>
        −
      </button>
      <span className="num">{value}</span>
      <button className="icon-btn" onClick={() => onChange(Math.min(9, value + 1))}>
        +
      </button>
    </div>
  );
}
