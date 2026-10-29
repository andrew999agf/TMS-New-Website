"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { refreshSessionAction } from "@/app/admin/session-actions";

/** Rendered only when the signed-in person's permissions changed since they
 *  signed in: refreshes the cookie once, then re-renders with the new access. */
export function SessionRefresher() {
  const router = useRouter();
  useEffect(() => { void refreshSessionAction().then((changed) => { if (changed) router.refresh(); }); }, [router]);
  return null;
}
