import { Rich } from "@/components/Rich";

/** Headers and the empty level-0 row say nothing. */
const BOILER = /(Level\s+Marks|Marks\s+Level)/gi;
const ZERO = /\b0\s+The work does not (?:meet|reach) a standard[^.]*\.\s*/gi;
/** A band starts at its marks: "1–2", "3–4", "[0]", or a definition level's "1 Vague definition 1". */
const BAND = /(?:^|\s)(\d+\s*[–-]\s*\d+|\[\d+\])\s+/g;
const DEFN = /(\d)\s+(?:Vague|Accurate|Limited|Clear|Appropriate)\s+definition\s+\1\s+/gi;
/** What the paper caps an incomplete answer at. */
const CAP = /([^.]*maximum of \*\*\[\d+\][^.]*\.\*\*|A maximum of \*\*\[\d+\]\*\*[^.]*\.)/g;
/** The sentences every mark scheme ends with: how to label, what else is accepted. */
const NOTE =
  /(Candidates who[^.]*\.|The (?:vertical|horizontal) axis[^.]*\.|Abbreviations are acceptable\.|A title is not necessary\.|Alternatively,[\s\S]*?rewarded\.|\(VAM\)|\*\*N\.B\.\*\*[^.]*\.)/g;
/** The level's own one-line name, which the band repeats. */
const HEAD = /(There is a correct diagram\s+\*\*(?:OR|AND)\*\*\s+an accurate written response\.)/;

type Band = { marks: string; head: string | null; lead: string; points: string[]; notes: string[] };

function band(marks: string, raw: string): Band {
  let text = raw.replace(/^\d\s+/, "").trim();
  const head = text.match(HEAD)?.[1] ?? null;
  if (head) text = text.replace(HEAD, " ");
  const notes = [...text.matchAll(NOTE)].map((m) => m[1]!.trim());
  text = text.replace(NOTE, " ").replace(/\s{2,}/g, " ").replace(/\s*\d\s*$/, "").trim();
  const parts = text.split("•").map((t) => t.trim()).filter(Boolean);
  return { marks, head, lead: parts[0] ?? "", points: parts.slice(1), notes };
}

function split(text: string): { rows: Band[]; rest: string } {
  const defn = [...text.matchAll(DEFN)];
  const hits = defn.length ? defn : [...text.matchAll(BAND)];
  if (hits.length < 2) return { rows: [], rest: text };
  const rows = hits.map((m, i) => {
    const from = m.index! + m[0].length;
    const to = i + 1 < hits.length ? hits[i + 1]!.index! : text.length;
    const marks = defn.length ? m[1]! : m[1]!.replace(/[[\]]/g, "").replace(/\s/g, "");
    return band(marks, text.slice(from, to));
  });
  // what sits before the first band is the level's name, which each band already carries
  const rest = text.slice(0, hits[0]!.index).trim();
  return { rows, rest: HEAD.test(rest) || /^\d\s/.test(rest) ? "" : rest };
}

/**
 * A mark scheme as something to read in a glance: what each band of marks takes, the points an
 * essay may include, the caps, and the notes about labelling. The level descriptors every essay
 * shares sit behind a toggle.
 */
export function MarkScheme({ text }: { text: string }) {
  const [main = "", criteria = ""] = text.split(/\*\*Assessment Criteria\*\*/);
  const caps = [...main.matchAll(CAP)].map((m) => m[1]!.trim());
  const body = main.replace(CAP, " ").replace(BOILER, " ").replace(ZERO, " ").replace(/\s{2,}/g, " ").trim();

  const may = /Answers\s+\*\*may\*\*\s+include:?/i.test(body);
  const points = may
    ? body.replace(/Answers\s+\*\*may\*\*\s+include:?/i, "").split("•").map((s) => s.trim()).filter(Boolean)
    : [];
  const { rows, rest } = may ? { rows: [] as Band[], rest: "" } : split(body);

  return (
    <div className="msread">
      {points.length > 0 && (
        <ul className="mspoints">
          {points.map((p, i) => {
            const at = p.indexOf(":");
            const label = at > 0 && at < 30 ? p.slice(0, at) : null;
            return (
              <li key={i}>
                {label && <b>{label}</b>}
                <Rich text={label ? p.slice(at + 1).trim() : p} />
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <table className="msbands">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <th>{r.marks}</th>
                <td>
                  {r.head && (
                    <p className="mshead">
                      <Rich text={r.head} />
                    </p>
                  )}
                  {r.lead && (
                    <p>
                      <Rich text={r.lead} />
                    </p>
                  )}
                  {r.points.length > 0 && (
                    <ul>
                      {r.points.map((pt, j) => (
                        <li key={j}>
                          <Rich text={pt} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.notes.length > 0 && (
                    <ul className="msnotes">
                      {r.notes.map((n, j) => (
                        <li key={j}>
                          <Rich text={n} />
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(rows.length === 0 && !may ? body : rest)
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>
            <Rich text={p} />
          </p>
        ))}

      {caps.map((c, i) => (
        <p key={i} className="mscap">
          <Rich text={c} />
        </p>
      ))}

      {criteria.trim() && (
        <details className="mslevels">
          <summary>Level descriptors</summary>
          {criteria
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l, i) => (
              <p key={i}>
                <Rich text={l} />
              </p>
            ))}
        </details>
      )}
    </div>
  );
}
