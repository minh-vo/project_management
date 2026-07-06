"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { logout, me } from "@/lib/api";

type AuthState = "loading" | "anonymous" | "authenticated";

export default function Home() {
  const [auth, setAuth] = useState<AuthState>("loading");

  useEffect(() => {
    me()
      .then(() => setAuth("authenticated"))
      .catch(() => setAuth("anonymous"));
  }, []);

  if (auth === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Loading...
        </p>
      </main>
    );
  }

  if (auth === "anonymous") {
    return <LoginForm onSuccess={() => setAuth("authenticated")} />;
  }

  return (
    <KanbanBoard
      onLogout={async () => {
        await logout();
        setAuth("anonymous");
      }}
    />
  );
}
