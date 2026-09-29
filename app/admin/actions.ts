"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AdminLoginResult {
  success: boolean;
  error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Server action to authenticate an admin using email and password.
 * Strictly verifies role = 'admin' in public.staff_roles.
 * Rejects and terminates session if role is not admin.
 * Never leaks user enumeration or raw Supabase errors.
 */
export async function adminLoginAction(formData: {
  email?: string;
  password?: string;
}): Promise<AdminLoginResult> {
  const email = (formData.email || "").trim().toLowerCase();
  const password = formData.password || "";

  if (!email || !EMAIL_REGEX.test(email) || !password) {
    return {
      success: false,
      error: "Email, mật khẩu hoặc quyền truy cập không hợp lệ.",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return {
      success: false,
      error: "Email, mật khẩu hoặc quyền truy cập không hợp lệ.",
    };
  }

  // Authoritative check against public.staff_roles
  const { data: roleData, error: roleError } = await supabase
    .from("staff_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (roleError || !roleData || roleData.role !== "admin") {
    // Non-admin or unauthorized: terminate session immediately
    await supabase.auth.signOut();
    return {
      success: false,
      error: "Email, mật khẩu hoặc quyền truy cập không hợp lệ.",
    };
  }

  return { success: true };
}

/**
 * Server action to sign out from the Admin Portal.
 * Invalidates the Supabase Auth session and redirects to /admin/login.
 */
export async function adminSignOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
