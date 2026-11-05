"use server";

import { redirect, RedirectType } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function logout(): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { error: "Could not log out. Please try again." };
  } catch {
    return { error: "Could not log out. Check your connection and try again." };
  }
  revalidatePath("/", "layout");
  redirect("/login", RedirectType.replace);
}
