import { Rich } from "@/components/Rich";
import { shortDateSG } from "@/lib/due";
import type { LessonReport } from "@/lib/lesson-report";

const WENT: Record<string, { label: string; pill: string }> = {
  right: { label: "Got it", pill: "green" },
  shaky: { label: "Shaky", pill: "amber" },
  wrong: { label: "Missed", pill: "red" },
};

/** A lesson's record, drawn the same way for the student and for the tutor's preview of it. */
export function LessonRecord({ report }: { report: LessonReport }) {
  const total = report.sections.reduce((n, s) => n + s.questions.length, 0);
  return (
    <>
      <div className="phead" style={{ marginBottom: 0 }}>
        <div>
          <h1>{report.title}</h1>
          <p>
            {report.taughtAt ? `Taught ${shortDateSG(report.taughtAt)}` : "Not taught yet"} · {total}{" "}
            {total === 1 ? "question" : "questions"}
          </p>
        </div>
      </div>

      {report.sections.length === 0 ? (
        <div className="card empty-state">
          <p className="muted">This lesson has no questions in it yet.</p>
        </div>
      ) : (
        report.sections.map((s) => (
          <section key={s.title} className="card">
            <div className="card-hd">
              <h2>{s.title}</h2>
              <span className="muted" style={{ fontSize: 14 }}>
                {s.note} {s.questions.length} {s.questions.length === 1 ? "question" : "questions"}
              </span>
            </div>
            <ol className="preplist">
              {s.questions.map((q) => (
                <li key={q.id}>
                  <span className="n">{q.marks}</span>
                  <div className="q">
                    <span className="meta">
                      {q.label && <span className="pill ink">{q.label}</span>}
                      {q.outcome && <span className={`pill ${WENT[q.outcome]!.pill}`}>{WENT[q.outcome]!.label}</span>}
                      {q.got !== null && (
                        <span>
                          {Math.round(q.got * 10) / 10}/{q.marks} marks
                        </span>
                      )}
                    </span>
                    <p className="qtext">
                      <Rich text={q.prompt} />
                    </p>
                  </div>
                  <div className="a">
                    {q.answer ? (
                      <>
                        <span className="qlabel">What you wrote</span>
                        <div className="answerbox">{q.answer}</div>
                      </>
                    ) : (
                      <span className="muted" style={{ fontSize: 13 }}>Done together in the lesson.</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </>
  );
}
