import type { Block } from "@/lib/content";

/**
 * Text with **bold** spans (as extracted from the papers), `tags` saying which paper a thing is set
 * in, and two highlights the model answer outlines use: ==what must be said== and ++what lifts the
 * answer above a pass++.
 */
const TOKEN = /\*\*(.+?)\*\*|`([^`]+)`|==(.+?)==|\+\+(.+?)\+\+/g;

export function Rich({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1] !== undefined) out.push(<b key={key++}>{m[1]}</b>);
    else if (m[2] !== undefined) out.push(<span key={key++} className="qtag">{m[2]}</span>);
    else if (m[3] !== undefined)
      out.push(
        <mark key={key++} className="hl-must">
          <Rich text={m[3]} />
        </mark>,
      );
    else
      out.push(
        <mark key={key++} className="hl-bonus">
          <Rich text={m[4]!} />
        </mark>,
      );
    last = at + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="blocks">
      {blocks.map((b, i) =>
        b.type === "text" ? (
          <p key={i}>
            <Rich text={b.text} />
          </p>
        ) : b.type === "table" ? (
          <div key={i} className="scrollx">
            <table className="t datatable">
              {b.caption && <caption>{b.caption}</caption>}
              <thead>
                <tr>
                  {b.columns.map((c, j) => (
                    <th key={j}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- local, auth-checked images of varying size
          <img key={i} src={`/api/past-img/${b.src}`} alt={b.caption ?? "Figure from the paper"} loading="lazy" />
        ),
      )}
    </div>
  );
}
