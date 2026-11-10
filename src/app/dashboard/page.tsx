"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, useSidebarToggle } from "@/components/Sidebar";
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

function DashboardContent({ boards }: { boards: BoardSummary[] }) {
  const toggle = useSidebarToggle();
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

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="sidebar-toggle"
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
            onClick={toggle}
          >
            &#9776;
          </button>
          <div className="brand">Activity Board</div>
        </div>
      </header>

      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Your workspace</p>
            <h1>Boards</h1>
            <p className="muted">Organize tasks into lists and drag cards as work moves forward.</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}

        <form className="create-board" onSubmit={createBoard}>
          <input type="text" name="title" maxLength={100} placeholder="New board title" required />
          <button type="submit" className="btn btn-primary">
            Create board
          </button>
        </form>

        {boards.length === 0 ? (
          <div className="empty">
            <strong>No boards yet.</strong>
            <p>Create your first board above to get started.</p>
          </div>
        ) : (
          <div className="board-grid">
            {boards.map((board) => (
              <a key={board.id} className="board-tile" href={`/board/${board.id}`}>
                <h2>{board.title}</h2>
                <p>
                  {board.role === "owner"
                    ? "Owner"
                    : board.role === "manager"
                      ? "Manager"
                      : "Shared with you"}
                  {board.member_count > 1 ? ` · ${board.member_count} members` : ""}
                </p>
              </a>
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
    return <main className="auth-card"><p className="lead">Redirecting…</p></main>;
  }
  if (!boards) {
    return null;
  }

  return (
    <>
      <div className="bg-decor" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <Sidebar active="dashboard" user={profile} boards={boards}>
        <DashboardContent boards={boards} />
      </Sidebar>
    </>
  );
}
