import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { patriotAdminPath } from "@/lib/patriot/hosts";

/**
 * Sign-in gate for the Patriot admin CONTENT tabs (News, Teams, Branding, …).
 * The Switchboard tab deliberately skips this so broadcast crew can operate
 * without accounts; everything that saves content still requires a session
 * here and re-checks auth in the server action.
 */
export async function requirePatriotSignIn() {
  const session = await getSession();
  if (!session) {
    const next = await patriotAdminPath();
    redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  }
  return session!;
}
