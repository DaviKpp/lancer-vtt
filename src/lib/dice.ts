// Dice helpers for LANCER rolls.

export function rollDie(sides: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % sides) + 1;
}

/**
 * Accuracy/difficulty: roll |net| d6 and keep the highest, added (accuracy) or
 * subtracted (difficulty) from the d20 roll.
 */
export function rollAccuracy(net: number): { dice: number[]; mod: number } {
  if (net === 0) return { dice: [], mod: 0 };
  const dice = Array.from({ length: Math.abs(net) }, () => rollDie(6));
  const best = Math.max(...dice);
  return { dice, mod: net > 0 ? best : -best };
}

export interface DiceRoll {
  total: number;
  detail: string;
  /** Overkill: heat the attacker takes (1 per damage die that came up 1 and was rerolled). */
  heat?: number;
}

/**
 * Rolls expressions like "1d6+2", "2d6", "3", "1d3+1d6".
 * Non-dice text (e.g. "X") rolls to 0 and is reported in the detail.
 * On a critical hit LANCER rolls the damage dice twice and keeps the highest dice.
 * Overkill (tag): every damage die that comes up 1 deals 1 heat to the attacker and is rerolled,
 * as many times as it keeps coming up 1.
 */
export function rollExpression(expr: string, crit = false, overkill = false): DiceRoll {
  const clean = String(expr).replace(/\s+/g, "");
  if (!clean) return { total: 0, detail: "0" };
  const terms = clean.match(/[+-]?[^+-]+/g) ?? [];
  let total = 0;
  let heat = 0;
  const parts: string[] = [];
  const die = (sides: number) => {
    let v = rollDie(sides);
    while (overkill && v === 1 && sides > 1) {
      heat++;
      v = rollDie(sides);
    }
    return v;
  };
  for (const term of terms) {
    const sign = term.startsWith("-") ? -1 : 1;
    const body = term.replace(/^[+-]/, "");
    const m = body.match(/^(\d*)d(\d+)$/i);
    if (m) {
      const count = Number(m[1] || 1);
      const sides = Number(m[2]);
      const roll = () => Array.from({ length: count }, () => die(sides));
      let dice = roll();
      let label = `${count}d${sides}[${dice.join(",")}]`;
      if (crit) {
        // Critical hit (LANCER core): roll the damage dice twice and keep the highest dice —
        // 2d6 becomes 4d6, keep the two highest. Shown as [kept|dropped].
        const all = [...dice, ...roll()].sort((a, b) => b - a);
        dice = all.slice(0, count);
        label = `${count}d${sides}[${dice.join(",")}|${all.slice(count).join(",")}]`;
      }
      const sum = dice.reduce((a, b) => a + b, 0);
      total += sign * sum;
      parts.push(`${sign < 0 ? "-" : ""}${label}`);
    } else if (/^\d+$/.test(body)) {
      total += sign * Number(body);
      parts.push(`${sign < 0 ? "-" : ""}${body}`);
    } else {
      parts.push(`(${body}?)`);
    }
  }
  const detail = parts.join(" + ").replace(/\+ -/g, "- ") + (heat ? ` · Exagero: ${heat}× 1 rolado de novo` : "");
  return { total: Math.max(0, total), detail, heat: heat || undefined };
}
