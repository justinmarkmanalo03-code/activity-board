"use client";

import { ActivityBackdrop } from "@/components/ActivityBackdrop";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, SidebarToggleButton } from "@/components/Sidebar";
import { ConfirmModal } from "@/components/Modals";
import { usePresenceHeartbeat, useSession } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";
import { displayDate, formatBytes } from "@/lib/format";
import type { BoardSummary, Profile } from "@/lib/types";

interface BoardRow {
  id: string;
  title: string;
  created_at: string;
  owner_id: string;
  board_members: { user_id: string; role: "owner" | "manager" | "member" }[];
}

interface TableStat {
  table_name: string;
  row_estimate: number;
  total_bytes: number;
  data_bytes: number;
  index_bytes: number;
}

interface BucketStat {
  bucket: string;
  object_count: number;
  bytes: number;
}

interface Stats {
  tables: TableStat[];
  buckets: BucketStat[];
  db_total_bytes: number;
}

const REFRESH_SECONDS = 30;
// Supabase free tier: ~500 MB database + 1 GB file storage.
const DB_QUOTA_BYTES = 500 * 1024 * 1024;
const STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;

function AdminContent({
  stats,
  updatedAt,
  status,
  members,
  resetTarget,
  resetResult,
  onResetPassword,
}: {
  stats: Stats | null;
  updatedAt: string;
  status: string;
  members: Profile[];
  resetTarget: Profile | null;
  resetResult: { username: string; tempPassword: string } | null;
  onResetPassword: (member: Profile) => void;
}) {
  const storageBytes = (stats?.buckets ?? []).reduce((sum, bucket) => sum + Number(bucket.bytes), 0);
  const dbBytes = Number(stats?.db_total_bytes ?? 0);
  const usedPercent = dbBytes > 0 ? Math.min(100, (dbBytes / DB_QUOTA_BYTES) * 100) : 0;
  const storagePercent =
    storageBytes > 0 ? Math.min(100, (storageBytes / STORAGE_QUOTA_BYTES) * 100) : 0;

  const largestFiles = (stats?.buckets ?? [])
    .slice()
    .sort((a, b) => Number(b.bytes) - Number(a.bytes));

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <SidebarToggleButton />
          <div className="brand">Activity Board</div>
        </div>
        <div className="topbar-right">
          <a className="back-link" href="/dashboard">&larr; Boards</a>
        </div>
      </header>

      <main className="page admin-page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>Storage monitor</h1>
            <p className="muted">
              Live estimate of your Supabase database and file storage. Auto-refreshes every {REFRESH_SECONDS} seconds.
            </p>
          </div>
          <div className="live-indicator">
            <span className="live-dot" id="liveDot"></span>
            <span className="muted small">Updated {updatedAt}</span>
          </div>
        </div>

        {status === "forbidden" && (
          <div className="alert">You need administrator access to view this page.</div>
        )}

        <section className="stat-grid">
          <article className="stat-card">
            <span className="stat-label">Database</span>
            <strong className="stat-value">{stats ? formatBytes(dbBytes) : "—"}</strong>
            <span className="stat-sub">{stats ? `${stats.tables.length} public tables` : "loading…"}</span>
          </article>
          <article className="stat-card">
            <span className="stat-label">File storage</span>
            <strong className="stat-value">{stats ? formatBytes(storageBytes) : "—"}</strong>
            <span className="stat-sub">
              {stats
                ? `${(stats.buckets ?? []).reduce((sum, b) => sum + Number(b.object_count), 0)} objects in ${stats.buckets.length} buckets`
                : "loading…"}
            </span>
          </article>
          <article className="stat-card">
            <span className="stat-label">DB quota (free tier)</span>
            <strong className="stat-value">{formatBytes(DB_QUOTA_BYTES)}</strong>
            <span className="stat-sub">{usedPercent.toFixed(1)}% used</span>
          </article>
          <article className="stat-card">
            <span className="stat-label">Storage quota (free tier)</span>
            <strong className="stat-value">{formatBytes(STORAGE_QUOTA_BYTES)}</strong>
            <span className="stat-sub">{storagePercent.toFixed(1)}% used</span>
          </article>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Database quota usage</h2>
            <span className={`status-pill ${usedPercent > 90 ? "status-critical" : "status-ok"}`}>
              {usedPercent.toFixed(1)}%
            </span>
          </div>
          <div className="usage-bar">
            <div className={`usage-fill ${usedPercent > 90 ? "status-critical" : "status-ok"}`} style={{ width: `${usedPercent}%` }}></div>
          </div>
          <p className="muted small">
            {formatBytes(dbBytes)} of {formatBytes(DB_QUOTA_BYTES)} used.
          </p>
        </section>

        <div className="admin-columns">
          <section className="panel">
            <div className="panel-head">
              <h2>Database tables</h2>
              <span className="muted small">{stats?.tables.length ?? 0} tables</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Table name</th>
                  <th className="cell-right">Rows (est.)</th>
                  <th className="cell-right">Data</th>
                  <th className="cell-right">Index</th>
                  <th className="cell-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.tables ?? []).map((table) => (
                  <tr key={table.table_name}>
                    <td>{table.table_name}</td>
                    <td className="cell-right">{Number(table.row_estimate).toLocaleString()}</td>
                    <td className="cell-right">{formatBytes(Number(table.data_bytes))}</td>
                    <td className="cell-right">{formatBytes(Number(table.index_bytes))}</td>
                    <td className="cell-right">{formatBytes(Number(table.total_bytes))}</td>
                  </tr>
                ))}
                {!stats && (
                  <tr>
                    <td className="empty-cell" colSpan={5}>
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Storage buckets</h2>
              <span className="muted small">{stats?.buckets.length ?? 0} buckets</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th className="cell-right">Objects</th>
                  <th className="cell-right">Size</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.buckets ?? []).map((bucket) => (
                  <tr key={bucket.bucket}>
                    <td>{bucket.bucket}</td>
                    <td className="cell-right">{Number(bucket.object_count).toLocaleString()}</td>
                    <td className="cell-right">{formatBytes(Number(bucket.bytes))}</td>
                  </tr>
                ))}
                {!stats && (
                  <tr>
                    <td className="empty-cell" colSpan={3}>
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h2>Top buckets by usage</h2>
            <span className="muted small">Largest Supabase storage buckets</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Bucket</th>
                <th className="cell-right">Size</th>
              </tr>
            </thead>
            <tbody>
              {largestFiles.map((bucket) => (
                <tr key={bucket.bucket}>
                  <td>{bucket.bucket}</td>
                  <td className="cell-right">{formatBytes(Number(bucket.bytes))}</td>
                </tr>
              ))}
              {largestFiles.length === 0 && (
                <tr>
                  <td className="empty-cell" colSpan={2}>
                    {stats ? "No storage used yet." : "Loading..."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Members</h2>
            <span className="muted small">
              {members.length} account{members.length === 1 ? "" : "s"} · reset passwords from here
            </span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Joined</th>
                <th className="cell-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>@{member.username}</td>
                  <td>{member.is_admin ? "Administrator" : "Member"}</td>
                  <td>{displayDate(member.created_at)}</td>
                  <td className="cell-right">
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => onResetPassword(member)}
                    >
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td className="empty-cell" colSpan={4}>
                    Loading...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Notes</h2>
          </div>
          <p className="muted small">
            Quota figures reflect the Supabase free tier (500 MB database, 1 GB file storage). Storage object
            sizes come from upload metadata and are close estimates. Run <code>supabase/schema.sql</code> again
            after upgrades; it is idempotent.
          </p>
        </section>
      </main>
    </>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { session, profile, loading } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [updatedAt, setUpdatedAt] = useState("loading...");
  const [status, setStatus] = useState("loading");
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetResult, setResetResult] = useState<{ username: string; tempPassword: string } | null>(null);

  useEffect(() => {
    document.body.className = "";
  }, []);

  usePresenceHeartbeat(Boolean(session));

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_storage_stats");
    if (error) {
      setStatus(error.message.toLowerCase().includes("forbidden") ? "forbidden" : "error");
      return;
    }
    setStats(data as Stats);
    setStatus("ok");
    setUpdatedAt(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    if (!session || !profile) return;
    if (!profile.is_admin) {
      setStatus("forbidden");
      return;
    }
    refresh();
    const timer = window.setInterval(refresh, REFRESH_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [session, profile, refresh]);

  useEffect(() => {
    if (!session?.user) return;
    const uid = session.user.id;
    supabase.from("boards").select("id, title, created_at, owner_id, board_members (user_id, role)").then(({ data }) => {
      const summaries: BoardSummary[] = ((data as BoardRow[]) ?? [])
        .map((row) => {
          const mine = row.board_members.find((m) => m.user_id === uid);
          if (!mine) return null;
          return {
            id: row.id,
            title: row.title,
            created_at: row.created_at,
            owner_id: row.owner_id,
            role: mine.role,
            member_count: row.board_members.length,
          } satisfies BoardSummary;
        })
        .filter((x): x is BoardSummary => x !== null);
      setBoards(summaries);
    });
  }, [session]);

  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true })
      .then(({ data }) => setMembers((data as Profile[]) ?? []));
  }, [session]);

  const resetPassword = useCallback(
    async (member: Profile) => {
      if (!session?.access_token) return;
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: member.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.tempPassword) {
        setResetResult(null);
        window.alert(payload?.error ?? "Could not reset the password.");
        return;
      }
      setResetResult({ username: payload.username ?? member.username, tempPassword: payload.tempPassword });
    },
    [session]
  );

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !profile) return null;

  return (
    <>
      <ActivityBackdrop intensity="calm" />
      <Sidebar active="admin" user={profile} boards={boards}>
        <AdminContent
          stats={stats}
          updatedAt={updatedAt}
          status={status}
          members={members}
          resetTarget={resetTarget}
          resetResult={resetResult}
          onResetPassword={(member) => setResetTarget(member)}
        />
      </Sidebar>

      {resetTarget && (
        <ConfirmModal
          title="Reset password"
          confirmLabel="Reset"
          message={`Generate a temporary password for @${resetTarget.username}? They can sign in with it and change it from their profile page.`}
          onConfirm={() => {
            const member = resetTarget;
            setResetTarget(null);
            resetPassword(member);
          }}
          onCancel={() => setResetTarget(null)}
        />
      )}

      {resetResult && (
        <div className="confirm-overlay">
          <div className="modal-card confirm-card" role="alertdialog" aria-modal="true">
            <header className="modal-head">
              <h2>Temporary password for @{resetResult.username}</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setResetResult(null)}
              >
                &#10005;
              </button>
            </header>
            <p className="muted confirm-message">
              Share this temporary password with <strong>@{resetResult.username}</strong>. Show it only to
              them — they should change it after signing in.
            </p>
            <div className="stack" style={{ marginTop: "10px" }}>
              <label>
                <span>Temporary password</span>
                <input
                  type="text"
                  readOnly
                  value={resetResult.tempPassword}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ fontFamily: "monospace", fontWeight: 600 }}
                />
              </label>
            </div>
            <div className="modal-actions">
              <div className="spacer"></div>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => navigator.clipboard?.writeText(resetResult.tempPassword)}
              >
                Copy
              </button>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => setResetResult(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
