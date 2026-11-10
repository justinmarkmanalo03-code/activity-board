"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.body.className = "auth-body";
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError("Incorrect email or password.");
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <>
      <div className="bg-decor" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <main className="auth-card">
      <div className="brand">Activity Board</div>
      <h1>Welcome back</h1>
      <p className="lead">Sign in to open your boards.</p>

      {error && <div className="alert">{error}</div>}

      <form className="stack" onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            name="email"
            value={email}
            maxLength={254}
            autoComplete="email"
            required
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="auth-foot">
        New here? <Link href="/register">Create a free account</Link>
      </p>
    </main>
    </>
  );
}
