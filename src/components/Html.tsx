import { useMemo } from "react";

const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "BR", "P", "UL", "OL", "LI", "SPAN", "DIV"]);

/** Minimal sanitizer for LANCER effect text (which contains <br>, <ul>, <b>...). */
function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      walk(child); // depth-first: clean descendants before deciding on this node
      if (child.tagName === "SCRIPT" || child.tagName === "STYLE") {
        child.remove();
      } else if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
      } else {
        for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);
      }
    }
  };
  const root = doc.body.firstElementChild as Element;
  walk(root);
  return root.innerHTML;
}

export function Html({ html, className }: { html?: string; className?: string }) {
  const clean = useMemo(() => (html ? sanitize(html) : ""), [html]);
  if (!clean) return null;
  return <div className={className ?? "html"} dangerouslySetInnerHTML={{ __html: clean }} />;
}
