"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  useEffect(() => {
    document.body.className = "auth-body";
  }, []);

  return (
    <>
      <div className="bg-decor" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <main className="auth-card">
        <div className="brand">Activity Board</div>
        <h1>Forgot your password?</h1>
        <p className="lead">
          Activity Board accounts sign in with a <strong>username only</strong> — no email — so there is
          no automatic reset link.
        </p>

        <div className="stack">
          <div className="alert">
            <p style={{ marginTop: 0 }}>
              <strong>How to reset it:</strong>
            </p>
            <ol style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
              <li>Ask an <strong>administrator</strong> of your workspace to reset your password.</li>
              <li>They will open <strong>Admin → Members</strong> and click <strong>Reset password</strong>.</li>
              <li>They will give you a temporary password — sign in with it and change it in <strong>Profile</strong>.</li>
            </ol>
          </div>
        </div>

        <p className="auth-foot">
          Remembered it? <Link href="/login">Back to sign in</Link>
        </p>
        <p className="auth-foot">
          No account yet? <Link href="/register">Create one</Link>
        </p>
      </main>
    </>
  );
}
