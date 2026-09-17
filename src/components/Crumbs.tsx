import Link from "next/link";

export function Crumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 && <span aria-hidden>/</span>}
          {c.href ? (
            <Link href={c.href} style={{ color: "inherit" }}>{c.label}</Link>
          ) : (
            <span className="cur">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
