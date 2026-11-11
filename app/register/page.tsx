"use client";

import { ActivityBackdrop } from "@/components/ActivityBackdrop";
import { Mascot } from "@/components/Mascot";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { emailForUsername } from "@/lib/auth";

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
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

    // Anonymous users can't read profiles (RLS), so ask the database instead.
    const { data: available } = await supabase.rpc("username_available", { p_username: username });
    if (available === false) {
      setErrors(["That username is already taken. If it is yours, try signing in instead."]);
      setBusy(false);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: emailForUsername(username),
      password,
      options: { data: { username } },
    });

    if (signUpError) {
      const message = signUpError.message.toLowerCase();
      if (message.includes("database error saving new user")) {
        // Trigger-level failure; in practice always a duplicate username.
        setErrors(["That username is already taken. If it is yours, try signing in instead."]);
      } else if (message.includes("rate limit")) {
        setErrors([
          "The signup limit was hit because email confirmation is still enabled. Ask the workspace admin to turn it off in Supabase (Authentication -> Providers -> Email -> Confirm email OFF), then try again.",
        ]);
      } else if (message.includes("already")) {
        setErrors(["That username is already taken."]);
      } else {
        setErrors([signUpError.message]);
      }
      setBusy(false);
      return;
    }

    if (!signUpData.session) {
      // Email confirmation is enabled on the Supabase project - accounts made of
      // usernames only can never confirm. Surface it instead of dead-ending.
      setErrors([]);
      setPending(true);
      setBusy(false);
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <>
      <ActivityBackdrop />
      <main className="auth-card">
        <Mascot />
        <div className="brand">Activity Board</div>
        <h1>Create your account</h1>
        <p className="lead">Free boards, lists, and cards. No email needed.</p>

        {errors.length > 0 && (
          <div className="alert">
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {pending && (
          <div className="alert">
            Signup received, but <strong>email confirmation is enabled</strong> on the Supabase project.
            This app uses usernames only, so confirmation can never complete. Ask the workspace admin to
            turn it off (Supabase → Authentication → Providers → Email → uncheck "Confirm email"), then
            sign up again.
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
