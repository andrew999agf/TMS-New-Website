"use server";

import { refreshSessionCookie } from "@/lib/auth";

/** Called by the admin shell when the database's permissions differ from the
 *  token's: re-signs the cookie so the Edge guard agrees with the pages. */
export async function refreshSessionAction(): Promise<boolean> {
  return refreshSessionCookie();
}
