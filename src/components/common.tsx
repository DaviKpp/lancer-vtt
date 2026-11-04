import { useState, type ReactNode } from "react";
import { tr } from "../lib/i18n";
import type { RangeEntry, TagEntry } from "../lib/types";

export function Section({
  title,
  children,
  defaultOpen = true,
  right,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section ${open ? "open" : ""}`}>
      <header className="section-head" onClick={() => setOpen((o) => !o)}>
        <span className="chev">{open ? "▾" : "▸"}</span>
        <h3>{title}</h3>
        <span className="spacer" />
        {right && <span onClick={(e) => e.stopPropagation()}>{right}</span>}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function Tags({ tags }: { tags: TagEntry[] }) {
  if (!tags.length) return null;
  return (
    <div className="tags">
      {tags.map((t, i) => (
        <span key={`${t.id}-${i}`} className="tag">
          {t.name}
        </span>
      ))}
    </div>
  );
}

export function rangeText(range: RangeEntry[]): string {
  return range.map((r) => `${tr(r.type)} ${r.val}`).join(", ");
}

export function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`;
}

/** Value of the Reliable X tag, if any. */
export function reliableValue(tags: TagEntry[]): number | undefined {
  const t = tags.find((x) => x.id === "tg_reliable");
  const n = Number(t?.val);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
