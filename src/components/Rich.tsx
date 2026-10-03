import type { Block } from "@/lib/content";

/**
 * Text with **bold** spans (as extracted from the papers) and `tags`, which the revision notes use
 * to say which paper a thing is set in — `P1(b)`, `P3 calculation` — without a sentence about it.
 */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*|`([^`]+)`/g);
  return (
    <>
      {parts.map((p, i) =>
        p === undefined ? null : i % 3 === 1 ? (
          <b key={i}>{p}</b>
        ) : i % 3 === 2 ? (
          <span key={i} className="qtag">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
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
