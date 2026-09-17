import type { ConceptStatus } from "@/lib/scoring";

// Status icons from reference/onside-demo.html. A status always has an icon and a word.
export function StatusBadge({ status }: { status: ConceptStatus }) {
  if (status === "solid")
    return (
      <span className="st solid">
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="9" r="8" fill="#2E6A43" />
          <path d="M5.4 9.3l2.4 2.4 4.8-5" fill="none" stroke="#FFFBF4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Solid
      </span>
    );
  if (status === "shaky")
    return (
      <span className="st shaky">
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="9" r="7.2" fill="none" stroke="#8F5E10" strokeWidth="1.6" />
          <path d="M9 1.8a7.2 7.2 0 0 1 0 14.4z" fill="#8F5E10" />
        </svg>
        Shaky
      </span>
    );
  return (
    <span className="st needs">
      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M9 1.8l7.6 13.4H1.4z" fill="#B3342B" />
        <path d="M9 7v3.6" stroke="#FFFBF4" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="9" cy="12.9" r="1" fill="#FFFBF4" />
      </svg>
      Needs work
    </span>
  );
}

export function HelpPill({ category }: { category: "without_ai" | "with_ai" | "unverified" | "no_answer" }) {
  if (category === "no_answer") return <span className="pill gray">No answer</span>;
  if (category === "without_ai") return <span className="pill ink">Without AI</span>;
  if (category === "with_ai") return <span className="pill hl">With AI</span>;
  return <span className="pill outline">Unverified</span>;
}
