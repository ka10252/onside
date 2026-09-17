import { redirect } from "next/navigation";
import { SignInForm } from "@/components/SignInForm";
import { currentUser, homeFor } from "@/lib/session";

export default async function StartPage() {
  const user = await currentUser();
  if (user) redirect(homeFor(user));

  return (
    <main className="page">
      <div className="narrow">
        <div className="phead">
          <div>
            <span className="logo" style={{ display: "inline-flex", marginBottom: 16 }}>Onside</span>
            <h1>Sign in</h1>
            <p>Use the login ID and password from your tutor.</p>
          </div>
        </div>
        <SignInForm />
      </div>
    </main>
  );
}
