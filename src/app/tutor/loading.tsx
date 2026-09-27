import { SlowNotice } from "@/components/SlowNotice";
import { NavFrame, TUTOR_TABS } from "@/components/Nav";

// Shown straight away while the page's data loads, so the browser never sits on a blank wait.
export default function Loading() {
  return (
    <>
      <NavFrame tabs={TUTOR_TABS} active="/tutor" />
      <main className="page">
        <div className="wrap stack">
          <div className="phead" style={{ marginBottom: 0 }}>
            <span className="skel head" />
          </div>
          <SlowNotice />
          <div className="card cardbody stack" style={{ gap: 14 }}>
            <span className="skel line" style={{ width: "40%" }} />
            <span className="skel block" />
            <span className="skel line" style={{ width: "70%" }} />
            <span className="skel line" style={{ width: "55%" }} />
          </div>
        </div>
      </main>
    </>
  );
}
