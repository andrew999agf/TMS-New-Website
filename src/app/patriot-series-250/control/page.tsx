import { redirect } from "next/navigation";

/**
 * The operator console now lives in the tabbed admin at /admin (the
 * "Switchboard" tab). Keep this old path working by redirecting.
 */
export default function ControlRedirect() {
  redirect("/admin");
}
