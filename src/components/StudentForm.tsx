"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/admin-actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function StudentForm({
  action,
  student,
  submitLabel,
  accent = false,
}: {
  action: Action;
  student?: { id: string; name: string; subtitle: string | null; username: string | null };
  submitLabel: string;
  accent?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="formgrid">
      {student && <input type="hidden" name="id" value={student.id} />}
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" className="answer" defaultValue={student?.name} maxLength={60} required autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="subtitle">
          Class <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
        </label>
        <input
          id="subtitle"
          name="subtitle"
          className="answer"
          defaultValue={student?.subtitle ?? ""}
          placeholder="IB DP Year 2 · Economics HL"
          maxLength={80}
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="username">Login ID</label>
        <input
          id="username"
          name="username"
          className="answer"
          defaultValue={student?.username ?? ""}
          placeholder="gildong"
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          required
          pattern="[A-Za-z0-9._\-]{3,30}"
          title="3–30 letters, numbers, dots, dashes or underscores"
        />
      </div>
      <div className="field">
        <label htmlFor="password">
          {student ? "New password" : "Password"}{" "}
          {student && <span className="muted" style={{ fontWeight: 400 }}>(leave empty to keep it)</span>}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="answer"
          autoComplete="new-password"
          minLength={4}
          required={!student}
        />
      </div>
      {state.error && <p className="formmsg bad" role="alert">{state.error}</p>}
      {state.ok && <p className="formmsg" role="status">{state.ok}</p>}
      <div>
        <button type="submit" className={`btn ${accent ? "accent" : "primary"}`} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
