import { describe, expect, it } from "vitest";
import { referencesIn, relevantContext, wantsEverything } from "./extract";
import type { Block } from "./content";

const text = (t: string): Block => ({ type: "text", text: t });
const image = (caption: string): Block => ({ type: "image", src: "x.png", caption });

// A Paper 2 stimulus: a lead-in, two texts with numbered paragraphs, and two tables.
const paper: Block[] = [
  text("Read the extracts and answer the questions that follow."),
  text("**Text A — Overview of North Macedonia**"),
  text("[1] North Macedonia is a small, landlocked nation."),
  text("[2] Despite its small market, it has grown."),
  text("[4] In 2018, export revenue was US$7.57 billion."),
  text("**Text B — Economic reforms**"),
  text("[1] To be considered for EU membership, reforms were made."),
  image("Table 1: Consumer Price Index"),
  image("Table 2: Economic data"),
];

describe("referencesIn", () => {
  it("finds what the question names", () => {
    expect(referencesIn("Using information from **Table 1**, calculate the change")).toEqual([
      { kind: "table", id: "1", paragraphs: [] },
    ]);
  });
  it("narrows to a paragraph when one is given", () => {
    expect(referencesIn("Using **Text A**, paragraph 4, calculate the balance")).toEqual([
      { kind: "text", id: "A", paragraphs: [4] },
    ]);
  });
  it("finds more than one", () => {
    expect(referencesIn("Using Text B and Figure 2, explain").map((r) => `${r.kind} ${r.id}`)).toEqual(["text B", "figure 2"]);
  });
  it("finds none when the question names none", () => {
    expect(referencesIn("Define the term depreciation.")).toEqual([]);
  });
});

describe("wantsEverything", () => {
  it("is true for the essay formula", () => {
    expect(wantsEverything("Using information from the text/data and your knowledge of economics, discuss")).toBe(true);
  });
  it("is false when a question merely says 'in the text' and then names the paragraph", () => {
    expect(wantsEverything("Define the term remittances indicated in bold in the text (**Text A**, paragraph 2)")).toBe(false);
  });
});

describe("relevantContext", () => {
  it("keeps only the table a calculation names", () => {
    const out = relevantContext(paper, "Using information from **Table 1**, calculate the change");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ caption: "Table 1: Consumer Price Index" });
  });
  it("keeps a text with its heading, and not the other text", () => {
    const out = relevantContext(paper, "Using **Text B**, explain the reforms");
    expect(out.map((b) => (b.type === "text" ? b.text : ""))).toEqual([
      "**Text B — Economic reforms**",
      "[1] To be considered for EU membership, reforms were made.",
    ]);
  });
  it("keeps one paragraph when the question asks for one", () => {
    const out = relevantContext(paper, "Using **Text A**, paragraph 4, calculate the balance of trade");
    expect(out.map((b) => (b.type === "text" ? b.text : ""))).toEqual([
      "**Text A — Overview of North Macedonia**",
      "[4] In 2018, export revenue was US$7.57 billion.",
    ]);
  });
  it("keeps everything for an essay that sends them to the whole paper", () => {
    expect(relevantContext(paper, "Using information from the text/data, discuss")).toHaveLength(paper.length);
  });
  it("keeps everything when the question names nothing", () => {
    expect(relevantContext(paper, "Define the term depreciation.")).toHaveLength(paper.length);
  });
  it("still trims a definition that says 'in the text' and then names the paragraph", () => {
    const out = relevantContext(paper, "Define the term shown in bold in the text (**Text A**, paragraph 2)");
    expect(out.map((b) => (b.type === "text" ? b.text : ""))).toEqual([
      "**Text A — Overview of North Macedonia**",
      "[2] Despite its small market, it has grown.",
    ]);
  });
  it("falls back to everything rather than nothing when a reference matches no block", () => {
    expect(relevantContext(paper, "Using **Table 9**, calculate")).toHaveLength(paper.length);
  });
});
