"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActivityBackdrop } from "@/components/ActivityBackdrop";
import { Sidebar, SidebarToggleButton } from "@/components/Sidebar";
import { usePresenceHeartbeat, useSession } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";
import type { BoardSummary } from "@/lib/types";

interface BoardRow {
  id: string;
  title: string;
  created_at: string;
  owner_id: string;
  board_members: { user_id: string; role: "owner" | "manager" | "member" }[];
}

const TILE_THEMES: [string, string][] = [
  ["#6366f1", "#8b5cf6"],
  ["#8b5cf6", "#d946ef"],
  ["#06b6d4", "#6366f1"],
  ["#10b981", "#06b6d4"],
  ["#f59e0b", "#f43f5e"],
  ["#ec4899", "#8b5cf6"],
];

function themeFor(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_THEMES[h % TILE_THEMES.length];
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const ROLE_LABEL = { owner: "Owner", manager: "Manager", member: "Member" } as const;

function BoardTile({ board, index }: { board: BoardSummary; index: number }) {
  const [a, b] = themeFor(board.id);
  const dots = Math.min(board.member_count, 4);

  function onMove(e: React.PointerEvent<HTMLAnchorElement>) {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${((0.5 - py) * 9).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((px - 0.5) * 11).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
  }

  function onLeave(e: React.PointerEvent<HTMLAnchorElement>) {
    const el = e.currentTarget;
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
  }

  return (
    <Link
      className="board-tile"
      href={`/board/${board.id}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={
        {
          "--ta": a,
          "--tb": b,
          animationDelay: `${Math.min(index, 12) * 55}ms`,
        } as React.CSSProperties
      }
    >
      <span className="tile-glare" aria-hidden="true" />
      <div className="tile-top">
        <span className="tile-badge" aria-hidden="true">
          {(board.title.trim()[0] ?? "?").toUpperCase()}
        </span>
        <span className={`tile-role role-${board.role}`}>{ROLE_LABEL[board.role]}</span>
      </div>
      <h2>{board.title}</h2>
      <div className="tile-foot">
        <span className="tile-members" title={`${board.member_count} member${board.member_count === 1 ? "" : "s"}`}>
          <span className="tile-dots" aria-hidden="true">
            {Array.from({ length: dots }).map((_, i) => (
              <i key={i} />
            ))}
          </span>
          {board.member_count} {board.member_count === 1 ? "member" : "members"}
        </span>
        <span className="tile-date">
          {new Date(board.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>
    </Link>
  );
}

function EmptyIllustration() {
  return (
    <svg className="empty-art" viewBox="0 0 160 120" aria-hidden="true">
      <defs>
        <linearGradient id="ea-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <rect x="14" y="26" width="52" height="70" rx="12" fill="#fff" opacity=".7" />
      <rect x="22" y="36" width="24" height="7" rx="3.5" fill="#a5b4fc" />
      <rect x="22" y="50" width="36" height="6" rx="3" fill="#e0e7ff" />
      <rect x="22" y="62" width="28" height="6" rx="3" fill="#e0e7ff" />
      <rect x="94" y="18" width="52" height="82" rx="12" fill="#fff" opacity=".7" />
      <rect x="102" y="28" width="24" height="7" rx="3.5" fill="#f0abfc" />
      <rect x="102" y="42" width="36" height="6" rx="3" fill="#fae8ff" />
      <circle cx="80" cy="66" r="26" fill="url(#ea-g)" />
      <ellipse cx="71" cy="62" rx="3.2" ry="4.2" fill="#2b2358" />
      <ellipse cx="89" cy="62" rx="3.2" ry="4.2" fill="#2b2358" />
      <path d="M72 73 Q80 81 88 73" fill="none" stroke="#2b2358" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="63" cy="71" rx="5" ry="3" fill="#fb7185" opacity=".45" />
      <ellipse cx="97" cy="71" rx="5" ry="3" fill="#fb7185" opacity=".45" />
    </svg>
  );
}

function DashboardContent({ boards, username }: { boards: BoardSummary[]; username: string }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function createBoard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const title = new FormData(form).get("title");
    if (typeof title !== "string" || title.trim() === "") return;

    const { data, error: rpcError } = await supabase.rpc("create_board", { p_title: title.trim() });
    if (rpcError || !data) {
      setError("Could not create the board. Please try again.");
      return;
    }
    router.push(`/board/${data}`);
  }

  const owned = boards.filter((b) => b.role === "owner").length;
  const shared = boards.length - owned;
  const teammates = boards.reduce((sum, b) => sum + Math.max(b.member_count - 1, 0), 0);

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <SidebarToggleButton />
          <div className="brand">Activity Board</div>
        </div>
        <span className="live-chip">
          <i aria-hidden="true" />
          Live workspace
        </span>
      </header>

      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Your workspace</p>
            <h1>
              {greeting()}, <span className="hero-name">@{username}</span>
            </h1>
            <p className="muted">Organize tasks into lists and drag cards as work moves forward.</p>
          </div>

          <div className="hero-stats" aria-label="Workspace summary">
            <div className="hero-stat">
              <strong>{boards.length}</strong>
              <span>Boards</span>
            </div>
            <div className="hero-stat">
              <strong>{owned}</strong>
              <span>Owned</span>
            </div>
            <div className="hero-stat">
              <strong>{shared}</strong>
              <span>Shared</span>
            </div>
            <div className="hero-stat">
              <strong>{teammates}</strong>
              <span>Teammates</span>
            </div>
          </div>
        </section>

        {error && <div className="alert">{error}</div>}

        <form className="create-board" onSubmit={createBoard}>
          <span className="create-plus" aria-hidden="true">
            +
          </span>
          <input type="text" name="title" maxLength={100} placeholder="Name a new board…" aria-label="New board title" required />
          <button type="submit" className="btn btn-primary">
            Create board
          </button>
        </form>

        {boards.length > 0 && (
          <div className="section-title">
            <h2>Your boards</h2>
            <span>{boards.length}</span>
          </div>
        )}

        {boards.length === 0 ? (
          <div className="empty">
            <EmptyIllustration />
            <strong>No boards yet.</strong>
            <p>Create your first board above to get started.</p>
          </div>
        ) : (
          <div className="board-grid">
            {boards.map((board, i) => (
              <BoardTile key={board.id} board={board} index={i} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { session, profile, loading } = useSession();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);

  useEffect(() => {
    document.body.className = "";
  }, []);

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  usePresenceHeartbeat(Boolean(session));

  const loadBoards = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase.from("boards").select(`
      id, title, created_at, owner_id,
      board_members ( user_id, role )
    `);
    if (!data) return;

    const uid = session.user.id;
    const summaries: BoardSummary[] = (data as BoardRow[])
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
          user_id: uid,
        } as BoardSummary & { user_id: string };
      })
      .filter((x): x is BoardSummary & { user_id: string } => x !== null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    setBoards(summaries);
  }, [session]);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  if (loading) {
    return null;
  }
  if (!session || !profile) {
    return (
      <main className="redirect-screen">
        <div className="auth-card">
          <p className="lead">Redirecting…</p>
        </div>
      </main>
    );
  }
  if (!boards) {
    return null;
  }

  return (
    <>
      <ActivityBackdrop />
      <Sidebar active="dashboard" user={profile} boards={boards}>
        <DashboardContent boards={boards} username={profile.username} />
      </Sidebar>
    </>
  );
}
