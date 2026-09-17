"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/lib/auth-actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  return (
    <form action={action} className="card cardbody formgrid" style={{ maxWidth: 420 }}>
      <div className="field">
        <label htmlFor="username">Login ID</label>
        <input
          id="username"
          name="username"
          className="answer"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.username}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="answer" autoComplete="current-password" required />
      </div>
      {state.error && <p className="formmsg bad" role="alert">{state.error}</p>}
      <div>
        <button type="submit" className="btn primary lg" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
