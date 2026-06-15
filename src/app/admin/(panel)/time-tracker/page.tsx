import { AdminHeader } from "@/components/admin/AdminShell";
import { TimeTracker } from "@/components/admin/TimeTracker";

export const dynamic = "force-dynamic";

export default function TimeTrackerPage() {
  return (
    <>
      <AdminHeader
        title="Time Tracker"
        description="Billable time tracking. Entries are stored in this browser; export to CSV for Clio."
      />
      <div className="p-8">
        <TimeTracker />
      </div>
    </>
  );
}
