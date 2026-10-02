import { Diagram, hasDiagram } from "./Diagram";
import { Rich } from "./Rich";

/**
 * The revision notes as written: headings, lists, tables, quotes and fenced blocks. Small on
 * purpose — these notes are written by hand in one place, so the shapes they use are known.
 */
export function Notes({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }
    // ":::diagram ad-as  An optional caption"
    const dgm = trimmed.match(/^:::diagram\s+([\w-]+)\s*(.*)$/);
    if (dgm && hasDiagram(dgm[1]!)) {
      out.push(<Diagram key={key++} name={dgm[1]!} caption={dgm[2]!.trim() || undefined} />);
      i++;
      continue;
    }
    if (trimmed === "---") {
      out.push(<hr key={key++} />);
      i++;
      continue;
    }
    if (trimmed.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) body.push(lines[i++]!);
      i++;
      out.push(
        <pre key={key++} className="notepre">
          {body.join("\n")}
        </pre>,
      );
      continue;
    }
    const head = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (head) {
      const level = head[1]!.length;
      const text = head[2]!;
      out.push(
        level <= 2 ? (
          <h3 key={key++} className="noteh">
            <Rich text={text} />
          </h3>
        ) : (
          <h4 key={key++} className="noteh4">
            <Rich text={text} />
          </h4>
        ),
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [headRow, ...body] = rows;
      out.push(
        <div key={key++} className="scrollx">
          <table className="t">
            {headRow && (
              <thead>
                <tr>
                  {headRow.map((c, j) => (
                    <th key={j}>
                      <Rich text={c} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((r, j) => (
                <tr key={j}>
                  {r.map((c, k) => (
                    <td key={k}>
                      <Rich text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\./.test(trimmed);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]!) || /^\s*\d+\.\s+/.test(lines[i]!))) {
        items.push(lines[i]!.trim().replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""));
        i++;
      }
      const li = items.map((t, j) => (
        <li key={j}>
          <Rich text={t} />
        </li>
      ));
      out.push(
        ordered ? (
          <ol key={key++} className="notelist">
            {li}
          </ol>
        ) : (
          <ul key={key++} className="notelist">
            {li}
          </ul>
        ),
      );
      continue;
    }
    if (trimmed.startsWith(">")) {
      out.push(
        <blockquote key={key++} className="notequote">
          <Rich text={trimmed.replace(/^>\s?/, "")} />
        </blockquote>,
      );
      i++;
      continue;
    }
    out.push(
      <p key={key++}>
        <Rich text={trimmed} />
      </p>,
    );
    i++;
  }
  return <div className="notes">{out}</div>;
}
