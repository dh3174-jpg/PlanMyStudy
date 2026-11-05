"use client";

import { useActionState } from "react";
import { logout } from "@/app/auth/logout";

export default function LogoutButton() {
  const [state, formAction, pending] = useActionState(logout, { error: null });
  return <form action={formAction} className="logout-form">
    <button className="logout-button" type="submit" disabled={pending}>{pending ? "Logging out…" : "Logout"}</button>
    {state.error && <p className="logout-error" role="alert">{state.error}</p>}
  </form>;
}
