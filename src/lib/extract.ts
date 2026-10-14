import type { Block } from "./content";

/**
 * The part of a paper's extract a question actually needs.
 *
 * A Paper 2 question carries the whole stimulus — three texts, two tables, a figure — but a
 * two-mark calculation that says "using Table 1" needs Table 1 and nothing else. Sending all of it
 * buries the question, so the references in the wording decide what travels with it.
 *
 * A question that names nothing, or sends the student to "the text/data" as the essays do, keeps
 * everything.
 */

/** "Text A", "Table 1", "Figure 2" — what a question names when it points at the stimulus. */
type Ref = { kind: string; id: string; paragraphs: number[] };

const LABEL = /\b(text|table|figure|chart|diagram|graph|exhibit)\s+([A-Z]|\d+)\b/gi;

export function referencesIn(prompt: string): Ref[] {
  const plain = prompt.replace(/\*\*/g, "");
  const out = new Map<string, Ref>();
  for (const m of plain.matchAll(LABEL)) {
    const key = `${m[1]!.toLowerCase()} ${m[2]!.toUpperCase()}`;
    if (!out.has(key)) out.set(key, { kind: m[1]!.toLowerCase(), id: m[2]!.toUpperCase(), paragraphs: [] });
    // "Text A, paragraph 4" narrows it to that paragraph.
    const after = plain.slice(m.index! + m[0].length, m.index! + m[0].length + 24);
    const para = after.match(/^[\s,]*paragraphs?\s+(\d+)/i);
    if (para) out.get(key)!.paragraphs.push(Number(para[1]));
  }
  return [...out.values()];
}

/**
 * True only for the essay formula "using information from the text/data", which means all of it.
 * A narrower test than it looks: "indicated in bold in the text (Text A, paragraph 2)" also says
 * "the text", but it then names the paragraph, and naming wins.
 */
export function wantsEverything(prompt: string): boolean {
  return /\btext\s*\/\s*data\b/i.test(prompt.replace(/\*\*/g, ""));
}

const heading = (b: Block) => (b.type === "text" ? b.text.replace(/\*\*/g, "").match(/^(Text|Table|Figure)\s+([A-Z]|\d+)\s*[—–-]/i) : null);
const paragraphNumber = (b: Block) => (b.type === "text" ? Number(b.text.match(/^\s*\[(\d+)\]/)?.[1] ?? 0) : 0);
const captionOf = (b: Block) => (b.type === "table" || b.type === "image" ? (b.caption ?? "") : "");

/**
 * Keeps the blocks the question names, with their headings, and drops the rest. Returns every
 * block when the question names nothing or asks for the material as a whole.
 */
export function relevantContext(blocks: Block[], prompt: string): Block[] {
  if (blocks.length === 0) return blocks;
  const refs = referencesIn(prompt);
  if (refs.length === 0 || wantsEverything(prompt)) return blocks;

  const wanted = (kind: string, id: string) => refs.find((r) => r.kind === kind && r.id === id);
  const out: Block[] = [];
  // A heading opens a section; the paragraphs under it belong to it until the next heading.
  let section: Ref | null = null;
  let seenHeading = false;

  for (const b of blocks) {
    const h = heading(b);
    if (h) {
      seenHeading = true;
      section = wanted(h[1]!.toLowerCase(), h[2]!.toUpperCase()) ?? null;
      if (section) out.push(b);
      continue;
    }
    // A sentence that names what the question named belongs with it: "Figure 3 illustrates a market
    // for fuel" is how the paper explains the figure, and the figure alone does not say what it is.
    if (b.type === "text" && !section) {
      const named = referencesIn(b.text).some((r) => wanted(r.kind, r.id));
      if (named) {
        out.push(b);
        continue;
      }
    }
    const caption = captionOf(b);
    if (caption) {
      const c = caption.replace(/\*\*/g, "").match(/^(Table|Figure|Chart|Graph|Exhibit)\s+([A-Z]|\d+)/i);
      if (c && wanted(c[1]!.toLowerCase(), c[2]!.toUpperCase())) out.push(b);
      continue;
    }
    if (section) {
      const n = paragraphNumber(b);
      // "paragraph 4" keeps that paragraph; a bare "Text A" keeps the whole text.
      if (section.paragraphs.length === 0 || (n > 0 && section.paragraphs.includes(n))) out.push(b);
      continue;
    }
    // Lead-in lines before any heading ("Read the extracts…") are noise once we are selecting.
    if (!seenHeading) continue;
  }
  // Never hand back nothing: if the references matched no block, the whole extract is safer.
  return out.length > 0 ? out : blocks;
}

/**
 * The question's own stem and the paper's extracts, filtered as one. Filtered apart, a question
 * whose "Figure 3" lives in the stem finds nothing in the extracts, and the safety net there hands
 * back the whole stimulus — which is how a one-mark calculation about fuel arrived carrying a table
 * about palm oil (Jin, 2026-10-14).
 */
export function neededBlocks(lead: Block[], context: Block[], prompt: string): { lead: Block[]; context: Block[] } {
  const all = [...lead, ...context];
  if (all.length === 0) return { lead, context };
  const kept = relevantContext(all, prompt);
  // The filter hands back its input when the question names nothing it can find: keep both whole.
  if (kept.length === all.length) return { lead, context };
  const keep = new Set(kept);
  return { lead: lead.filter((b) => keep.has(b)), context: context.filter((b) => keep.has(b)) };
}
