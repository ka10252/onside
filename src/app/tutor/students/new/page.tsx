import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { StudentForm } from "@/components/StudentForm";
import { createStudent } from "@/lib/admin-actions";
import { requireUser } from "@/lib/session";

export default async function NewStudentPage() {
  const user = await requireUser("tutor");
  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor" />
      <main className="page">
        <div className="narrow">
          <Crumbs items={[{ href: "/tutor", label: "Students" }, { label: "Add student" }]} />
          <div className="phead">
            <div>
              <h1>Add student</h1>
              <p>The student signs in with this login ID and password.</p>
            </div>
          </div>
          <div className="card cardbody">
            <StudentForm action={createStudent} submitLabel="Add student" accent />
          </div>
        </div>
      </main>
    </>
  );
}
