"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
    const supabase = createClient();

    const handleLogin = async () => {
        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
    };

    return (
        <main
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#FCFAF6",
                padding: "24px",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: "420px",
                    background: "#ffffff",
                    border: "1px solid #D8D6CF",
                    borderRadius: "16px",
                    padding: "36px",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
                }}
            >
                <h1
                    style={{
                        margin: 0,
                        fontSize: "36px",
                        color: "#262821",
                    }}
                >
                    PlanMyStudy
                </h1>

                <p
                    style={{
                        color: "#8D9188",
                        marginTop: "10px",
                        marginBottom: "28px",
                    }}
                >
                    Sign in to access the prompt chain studio.
                </p>

                <button
                    onClick={handleLogin}
                    style={{
                        width: "100%",
                        padding: "14px",
                        borderRadius: "10px",
                        border: "none",
                        background: "#6F8B63",
                        color: "white",
                        fontSize: "16px",
                        fontWeight: 600,
                        cursor: "pointer",
                    }}
                >
                    Continue with Google
                </button>
            </div>
        </main>
    );
}