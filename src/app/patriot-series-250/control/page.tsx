import { redirect } from "next/navigation";
import { patriotAdminPath } from "@/lib/patriot/hosts";

/**
 * The operator console now lives in the tabbed Patriot admin (the
 * "Switchboard" tab). Keep this old path working by redirecting to it on
 * whichever host is serving the request.
 */
export default async function ControlRedirect() {
  redirect(await patriotAdminPath());
}
