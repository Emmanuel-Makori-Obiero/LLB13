import type { ReactNode } from "react";

// Small, safe markdown renderer for AI answers.
// It builds React elements only (no dangerouslySetInnerHTML), so model output cannot inject HTML.
// Supports: headings, bold/italic/code, lists (nested), tables, block quotes, rules, [S1] citations.

const INLINE =
  /(\*\*.+?\*\*(?!\*)|\*[^*\s][^*]*?\*(?!\*)|`[^`]+`|\[S\d+\])/g;

function inline(text: string, base: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  // Models occasionally emit an unmatched closing marker. Never show the
  // Markdown control characters to students when that happens.
  const plain = (s: string) => s.replace(/\*{2,}|_{2,}/g, "");
  for (const m of text.matchAll(INLINE)) {
    const t = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(plain(text.slice(last, at)));
    const key = `${base}-${n++}`;
    if (t.startsWith("**"))
      out.push(<strong key={key}>{inline(t.slice(2, -2), key)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={key}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[S"))
      out.push(
        <sup className="md-cite" key={key}>
          {t.slice(1, -1)}
        </sup>,
      );
    else out.push(<em key={key}>{inline(t.slice(1, -1), key)}</em>);
    last = at + t.length;
  }
  if (last < text.length) out.push(plain(text.slice(last)));
  return out;
}

type Item = { text: string; ordered: boolean; indent: number; kids: Item[] };

function renderList(items: Item[], key: string): ReactNode {
  const Tag = items[0]?.ordered ? "ol" : "ul";
  return (
    <Tag key={key}>
      {items.map((it, i) => (
        <li key={`${key}-${i}`}>
          {inline(it.text, `${key}-${i}`)}
          {it.kids.length > 0 && renderList(it.kids, `${key}-${i}k`)}
        </li>
      ))}
    </Tag>
  );
}

const LIST_LINE = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text
    .replace(/\r/g, "")
    .replace(/^\s*```(?:markdown|md)?\s*$/gim, "")
    .split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  const startsBlock = (line: string, next?: string) =>
    /^#{1,4}\s/.test(line) ||
    LIST_LINE.test(line) ||
    /^\s*>/.test(line) ||
    /^\s*([-*_])\1{2,}\s*$/.test(line) ||
    (line.includes("|") && next !== undefined && TABLE_RULE.test(next));

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const key = `b${k++}`;

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      blocks.push(
        level <= 2 ? (
          <h3 className="md-h" key={key}>
            {inline(h[2], key)}
          </h3>
        ) : (
          <h4 className="md-sub" key={key}>
            {inline(h[2], key)}
          </h4>
        ),
      );
      i++;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr className="md-rule" key={key} />);
      i++;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(cells(lines[i]));
        i++;
      }
      blocks.push(
        <div className="md-table-wrap" key={key}>
          <table className="md-table">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c, `${key}h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {head.map((_, j) => (
                    <td key={j}>{inline(r[j] ?? "", `${key}r${ri}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote className="md-quote" key={key}>
          {inline(quote.join(" "), key)}
        </blockquote>,
      );
      continue;
    }

    if (LIST_LINE.test(line)) {
      const root: Item = { text: "", ordered: false, indent: -1, kids: [] };
      const stack: Item[] = [root];
      while (i < lines.length) {
        const m = LIST_LINE.exec(lines[i]);
        if (!m) {
          // indented continuation of the previous item
          if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && stack.length > 1) {
            stack[stack.length - 1].text += " " + lines[i].trim();
            i++;
            continue;
          }
          break;
        }
        const node: Item = {
          indent: m[1].replace(/\t/g, "    ").length,
          ordered: /\d/.test(m[2]),
          text: m[3],
          kids: [],
        };
        while (stack.length > 1 && stack[stack.length - 1].indent >= node.indent)
          stack.pop();
        stack[stack.length - 1].kids.push(node);
        stack.push(node);
        i++;
      }
      blocks.push(renderList(root.kids, key));
      continue;
    }

    // paragraph: gather lines until a blank line or the start of another block
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !startsBlock(lines[i], lines[i + 1])
    ) {
      para.push(lines[i]);
      i++;
    }
    // a first line that is only bold text is a sub-heading ("**1. Background**")
    if (/^\*\*[^*].*\*\*$/.test(para[0].trim())) {
      blocks.push(
        <h4 className="md-sub" key={key}>
          {inline(para[0].trim().slice(2, -2), key)}
        </h4>,
      );
      para.shift();
      if (para.length === 0) continue;
    }
    const joined = para.map((p) => p.trimEnd());
    blocks.push(
      <p key={key}>
        {para.map((p, j) => (
          <span key={j}>
            {inline(p.trim(), `${key}-${j}`)}
            {j < para.length - 1 && (/ {2,}$/.test(joined[j]) ? <br /> : " ")}
          </span>
        ))}
      </p>,
    );
  }

  return <div className="md">{blocks}</div>;
}
