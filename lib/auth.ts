import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireSuperadmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const { data: profile, error } = await supabase.from("profiles")
    .select("is_superadmin").eq("id", user.id).single();
  if (error || profile?.is_superadmin !== true) redirect("/login?error=unauthorized");
  return { supabase, user };
}
