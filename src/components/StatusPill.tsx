import type { AssignmentStatus } from "@/lib/admin";
import { formatDue } from "@/lib/due";

const STATUS: Record<AssignmentStatus, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "gray" },
  in_progress: { label: "In progress", cls: "amber" },
  submitted: { label: "Submitted · Needs review", cls: "red" },
  reviewed: { label: "Reviewed", cls: "green" },
};

export function StatusPill({
  status,
  answered,
  total,
  due,
}: {
  status: AssignmentStatus;
  answered?: number;
  total?: number;
  due?: string | null;
}) {
  const st = STATUS[status];
  let extra = "";
  if (status === "in_progress" && total) extra = ` · ${answered ?? 0} of ${total}`;
  if (status === "not_started" && due) extra = ` · Due ${formatDue(due)}`;
  return (
    <span className={`pill ${st.cls}`}>
      {st.label}
      {extra}
    </span>
  );
}

export { formatDue };
