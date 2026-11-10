"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    document.body.className = "auth-body";
    let done = false;
    supabase.auth.getSession().then(({ data }) => {
      if (done) return;
      done = true;
      router.replace(data.session ? "/dashboard" : "/login");
    });
  }, [router]);

  return (
    <main className="auth-card">
      <div className="brand">Activity Board</div>
      <p className="lead">Redirecting…</p>
    </main>
  );
}
