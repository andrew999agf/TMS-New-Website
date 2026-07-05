"use server";

import { redirect } from "next/navigation";
import { login, logout } from "@/lib/auth";

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!email || !password) return { error: "Enter your email and password." };

  const result = await login(email, password);
  if (!result.ok) return { error: result.error };

  // Internal destinations only (no open redirect): the firm admin, or the
  // Patriot operator console when sign-in started from the Patriot site.
  const safeNext = next.startsWith("/admin") || next.startsWith("/patriot-series-250/admin") ? next : "/admin";
  redirect(safeNext);
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}
