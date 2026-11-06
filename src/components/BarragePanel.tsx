import { useMemo, useState } from "react";
import { AttackTargets, newTargetRow, toTargetInputs, useTargetArrows, type TargetRow } from "./AttackTarget";
import type { CombatantState, RollResult, Sheet } from "../lib/types";
import { tr } from "../lib/i18n";
import { takeAction } from "../obr/actions";
import { performAttackOnTargets } from "../obr/attack";
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
  // each attack (weapon, or each shot of a weapon that attacks several times) has its own target and modifiers
  const [rows, setRows] = useState<Record<string, TargetRow[]>>({});
  const [bonusDamage, setBonusDamage] = useState("");
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

  const attacks = chosen.flatMap((g) =>
    g.weapons.flatMap((spec, i) => {
      const n = Math.max(1, Math.min(6, spec.attacks ?? 1));
      return Array.from({ length: n }, (_, k) => ({
        id: `${g.key}:${i}:${k}`,
        group: g.name,
        spec,
        label: n > 1 ? `${spec.label} (${k + 1}/${n})` : spec.label,
      }));
    }),
  );
  const rowsFor = (id: string) => rows[id] ?? [newTargetRow(targets[0]?.id ?? "")];
  const setRowsFor = (id: string, list: TargetRow[]) => setRows((rs) => ({ ...rs, [id]: list }));
  // the arrows go away once the attacks are rolled, so the shot animations are easy to see
  const [rolled, setRolled] = useState(false);
  useTargetArrows(
    c,
    attacks.flatMap((a) => rowsFor(a.id).map((r) => ({ targetId: r.targetId, weapon: a.spec.label }))),
    rolled,
  );

  const roll = async () => {
    setBusy(true);
    setRolled(true);
    try {
      if (!charged) {
        await takeAction(c, "full", "Rajada", { id: app.session.playerId, name: app.session.playerName }, {
          detail: chosen.map((g) => g.name).join(" + "),
        });
        setCharged(true);
      }
      const out: RollResult[] = [];
      for (const [i, a] of attacks.entries()) {
        // automatic modifiers (conditions, cover, weapon tags) are applied per attack
        const rs = await performAttackOnTargets(c.id, a.spec, toTargetInputs(rowsFor(a.id)), {
          // bonus damage only on the first attack
          bonusDamage: i === 0 ? bonusDamage.trim() || undefined : undefined,
          label: `${a.label} (Rajada)`,
          by: { id: app.session.playerId, name: app.session.playerName },
        });
        out.push(...rs);
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

      {attacks.map((a, i) => {
        const list = rowsFor(a.id);
        const first = attacks[0] && rowsFor(attacks[0].id)[0];
        return (
          <div key={a.id} className="attack-row">
            <div className="attack-row-head">
              {a.label}
              {i > 0 && first?.targetId && list[0]?.targetId !== first.targetId && (
                <button className="btn-small ghost" onClick={() => setRowsFor(a.id, [{ ...list[0], targetId: first.targetId }, ...list.slice(1)])}>
                  Mesmo alvo do 1º
                </button>
              )}
            </div>
            <AttackTargets attacker={c} spec={a.spec} rows={list} onChange={(l) => setRowsFor(a.id, l)} />
          </div>
        );
      })}
      {attacks.some((a) => a.spec.kind === "attack") && (
        <div className="form-grid">
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
