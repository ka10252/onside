import type { Question } from "@/lib/content";

/**
 * A multiple-choice question read back: every option in its own order, the one the student picked
 * (with the try number when they had more than one go), and the right one when it may be shown.
 */
export function Choices({
  q,
  tried,
  showAnswer,
}: {
  q: Extract<Question, { format: "mcq" }>;
  tried: string[];
  showAnswer: boolean;
}) {
  return (
    <ol className="choices readback">
      {q.options.map((o) => {
        const at = tried.indexOf(o.id);
        const chose = at >= 0;
        const right = showAnswer && o.id === q.answer;
        return (
          <li key={o.id} className={`choice${chose ? " picked" : ""}${right ? " right" : ""}`}>
            <span className="k">{o.id.toUpperCase()}</span>
            <span className="grow">{o.text}</span>
            {chose && (
              <span className="tag">
                {tried.length > 1 ? `Try ${at + 1}` : "Chosen"}
                {right || !showAnswer ? "" : " · wrong"}
              </span>
            )}
            {right && <span className="tag good">Right answer</span>}
          </li>
        );
      })}
    </ol>
  );
}
