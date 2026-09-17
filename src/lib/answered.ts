// "Answered" = the student put something in: a chosen option, typed text, a plan or a photo.

type Row = {
  submitted_at: string | null;
  final_text: string | null;
  working_text: string | null;
  plan_text: string | null;
  photo_path: string | null;
  answers: string | null;
};

/** SQL condition on a responses row (alias `r` by default). */
export const hasAnswerSql = (r = "r") =>
  `(${r}.submitted_at IS NOT NULL OR COALESCE(${r}.final_text, '') <> '' OR COALESCE(${r}.working_text, '') <> ''
    OR COALESCE(${r}.plan_text, '') <> '' OR ${r}.photo_path IS NOT NULL OR ${r}.answers IS NOT NULL)`;

export function hasAnswer(r: Row): boolean {
  return Boolean(r.submitted_at || r.final_text || r.working_text || r.plan_text || r.photo_path || r.answers);
}
