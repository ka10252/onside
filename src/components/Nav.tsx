import Link from "next/link";
import { signOut } from "@/lib/auth-actions";
import { initials } from "@/lib/format";
import type { User } from "@/lib/session";

export type Tab = { href: string; label: string; /** A mark saying there is something new behind this tab. */ dot?: boolean };

export function Nav({ user, tabs, active }: { user: User; tabs: Tab[]; active: string }) {
  return (
    <header className="nav">
      <div className="nav-in">
        <Link href={user.role === "tutor" ? "/tutor" : "/student"} className="logo" style={{ textDecoration: "none", color: "inherit" }}>
          Onside
        </Link>
        <nav className="tabs" aria-label="Main">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className={`tab${t.href === active ? " on" : ""}`} style={{ textDecoration: "none" }}>
              {t.label}
              {t.dot && <span className="newdot" aria-label="Something new" />}
            </Link>
          ))}
        </nav>
        <div className="me">
          <span className="avatar" aria-hidden>{initials(user.name)}</span>
          <span>{user.name}</span>
          <form action={signOut}>
            <button className="link" type="submit">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}

export const TUTOR_TABS: Tab[] = [
  { href: "/tutor", label: "Students" },
  { href: "/tutor/concepts", label: "Concepts" },
  { href: "/tutor/sets", label: "Sets" },
  { href: "/tutor/bank", label: "Questions" },
];

export const STUDENT_TABS: Tab[] = [
  { href: "/student", label: "Assignments" },
  { href: "/student/notes", label: "Revision notes" },
];

/** The same bar without the person, for the moment before a page's data arrives. */
export function NavFrame({ tabs, active }: { tabs: Tab[]; active: string }) {
  return (
    <header className="nav">
      <div className="nav-in">
        <span className="logo">Onside</span>
        <nav className="tabs" aria-label="Main">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className={`tab${t.href === active ? " on" : ""}`} style={{ textDecoration: "none" }}>
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="me">
          <span className="skel" style={{ width: 32, height: 32, borderRadius: "50%" }} />
          <span className="skel line" style={{ width: 84 }} />
        </div>
      </div>
    </header>
  );
}
