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
}

/**
 * Rolls expressions like "1d6+2", "2d6", "3", "1d3+1d6".
 * Non-dice text (e.g. "X") rolls to 0 and is reported in the detail.
 * On a critical hit LANCER rolls the damage dice twice and keeps the highest result.
 */
export function rollExpression(expr: string, crit = false): DiceRoll {
  const clean = String(expr).replace(/\s+/g, "");
  if (!clean) return { total: 0, detail: "0" };
  const terms = clean.match(/[+-]?[^+-]+/g) ?? [];
  let total = 0;
  const parts: string[] = [];
  for (const term of terms) {
    const sign = term.startsWith("-") ? -1 : 1;
    const body = term.replace(/^[+-]/, "");
    const m = body.match(/^(\d*)d(\d+)$/i);
    if (m) {
      const count = Number(m[1] || 1);
      const sides = Number(m[2]);
      const roll = () => Array.from({ length: count }, () => rollDie(sides));
      let dice = roll();
      let label = `${count}d${sides}[${dice.join(",")}]`;
      if (crit) {
        const second = roll();
        const sumA = dice.reduce((a, b) => a + b, 0);
        const sumB = second.reduce((a, b) => a + b, 0);
        label = `${count}d${sides}[${dice.join(",")}|${second.join(",")}]`;
        if (sumB > sumA) dice = second;
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
  return { total: Math.max(0, total), detail: parts.join(" + ").replace(/\+ -/g, "- ") };
}
