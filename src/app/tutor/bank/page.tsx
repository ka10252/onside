import Link from "next/link";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { listParts } from "@/lib/content";
import { requireUser } from "@/lib/session";

export default async function BankPage() {
  const user = await requireUser("tutor");
  const parts = listParts();

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor/bank" />
      <main className="page">
        <div className="wrap">
          <div className="phead">
            <div>
              <h1>Question bank</h1>
              <p>Onside questions from the unit packs and original past-paper questions (M22–N25), sorted by unit.</p>
            </div>
          </div>
          <div className="partlist">
            {parts.map((p) => (
              <section key={p.id} className="card">
                <div className="card-hd">
                  <h2>{p.name}</h2>
                </div>
                {p.units.map((u) => {
                  const inner = (
                    <>
                      <span className="n">{u.number}</span>
                      <span>{u.title}</span>
                      <span className="rowacts">
                        {u.past_count > 0 && <span className="pill gray">{u.past_count} past</span>}
                        {u.question_count > 0 && <span className="pill green">{u.question_count} Onside</span>}
                        {u.concept_extraction === "thin" && <span className="pill amber">Notes need a manual pass</span>}
                      </span>
                    </>
                  );
                  return (
                    <Link key={u.id} href={`/tutor/bank/${u.number}`} className="unitrow">
                      {inner}
                    </Link>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
