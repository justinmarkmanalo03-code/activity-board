"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmNotice, setConfirmNotice] = useState(false);
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

    const nextErrors: string[] = [];
    if (!USERNAME_RE.test(username)) {
      nextErrors.push("Username must be 3-30 characters using letters, numbers, or underscores.");
    }
    if (password.length < 8) {
      nextErrors.push("Password must be at least 8 characters.");
    }
    if (password !== confirm) {
      nextErrors.push("Passwords do not match.");
    }
    setErrors(nextErrors);
    if (nextErrors.length > 0) return;

    setBusy(true);

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) {
      setErrors(["That username is already taken."]);
      setBusy(false);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });

    if (signUpError) {
      setErrors([signUpError.message.includes("already")
        ? "That email is already registered."
        : signUpError.message]);
      setBusy(false);
      return;
    }

    if (!signUpData.session) {
      // Email confirmation is enabled on the Supabase project.
      setErrors([]);
      setConfirmNotice(true);
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
      <h1>Create your account</h1>
      <p className="lead">Free boards, lists, and cards.</p>

      {errors.length > 0 && (
        <div className="alert">
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {confirmNotice && (
        <div className="alert alert-success">
          Account created! Check your email inbox to confirm your address, then sign in below.
        </div>
      )}

      <form className="stack" onSubmit={onSubmit}>
        <label>
          Username
          <input
            type="text"
            name="username"
            value={username}
            maxLength={30}
            pattern="[A-Za-z0-9_]{3,30}"
            autoComplete="username"
            required
            autoFocus
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            name="email"
            value={email}
            maxLength={254}
            autoComplete="email"
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            minLength={8}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            name="confirm"
            minLength={8}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="auth-foot">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
    </>
  );
}
