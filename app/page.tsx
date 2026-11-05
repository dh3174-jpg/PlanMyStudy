import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function HomePage() {
    await connection();

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_superadmin")
        .eq("id", user.id)
        .single();

    if (error || !profile?.is_superadmin) {
        redirect("/login?error=unauthorized");
    }

    return (
        <main
            style={{
                minHeight: "100vh",
                background: "#FCFAF6",
                padding: "40px",
            }}
        >
            <h1
                style={{
                    fontSize: "40px",
                    color: "#262821",
                    marginBottom: "12px",
                }}
            >
                PlanMyStudy
            </h1>

            <p
                style={{
                    color: "#8D9188",
                    fontSize: "18px",
                }}
            >
                Superadmin access confirmed.
            </p>
        </main>
    );
}