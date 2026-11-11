"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { BoardList, BoardSummary, Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";

const SIDEBAR_KEY = "sidebarCollapsed";

const ShellContext = createContext<() => void>(() => {});

export function useSidebarToggle() {
  return useContext(ShellContext);
}

export function SidebarToggleButton() {
  const toggle = useSidebarToggle();
  return (
    <button
      type="button"
      className="sidebar-toggle"
      title="Toggle sidebar"
      aria-label="Toggle sidebar"
      onClick={toggle}
    >
      &#9776;
    </button>
  );
}

export function Sidebar({
  active,
  user,
  boards,
  lists,
  showLists,
  boardId,
  children,
}: {
  active: string;
  user: Profile;
  boards: BoardSummary[];
  lists?: BoardList[];
  showLists?: boolean;
  boardId?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      // storage unavailable
    }
    try {
      setOpen(sessionStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      // storage unavailable
    }
  }, []);

  const toggle = () => {
    const narrow = window.matchMedia("(max-width: 900px)").matches;
    if (narrow) {
      setOpen((prev) => {
        const next = !prev;
        try {
          sessionStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
        } catch {
          // ignore
        }
        return next;
      });
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const shellClass = `app-shell${collapsed ? " sidebar-collapsed" : ""}${open ? " sidebar-open" : ""}`;

  return (
    <ShellContext.Provider value={toggle}>
      <div className={shellClass} id="appShell">
        <aside className="app-sidebar" id="appSidebar" aria-label="Workspace navigation">
          <div className="sidebar-head">
            <span className="workspace-badge">AB</span>
            <div className="workspace-meta">
              <strong>Activity Board</strong>
              <span>Workspace</span>
            </div>
            <button
              type="button"
              className="sidebar-collapse"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              onClick={toggle}
            >
              &#171;
            </button>
          </div>

          <nav className="sidebar-nav">
            <Link className={`sidebar-link${active === "dashboard" ? " is-active" : ""}`} href="/dashboard">
              <span className="sidebar-icon">&#8962;</span>
              <span className="sidebar-label">Home</span>
            </Link>
            <Link className={`sidebar-link${active === "profile" ? " is-active" : ""}`} href="/profile">
              <span className="sidebar-icon">&#9787;</span>
              <span className="sidebar-label">Profile</span>
            </Link>

            <div className="sidebar-section">
              <span className="sidebar-section-title">Spaces</span>
              {boards.map((board) => (
                <Link
                  key={board.id}
                  className={`sidebar-link${board.id === boardId ? " is-active" : ""}`}
                  href={`/board/${board.id}`}
                >
                  <span className="sidebar-icon sidebar-icon-square">
                    {(board.title.trim()[0] ?? "?").toUpperCase()}
                  </span>
                  <span className="sidebar-label">{board.title}</span>
                </Link>
              ))}
              {boards.length === 0 && <span className="sidebar-empty">No boards yet</span>}
            </div>

            {showLists && lists && (
              <div className="sidebar-section">
                <span className="sidebar-section-title">Lists</span>
                {lists.map((list) => (
                  <a key={list.id} className="sidebar-link" href={`#list-${list.id}`}>
                    <span className="sidebar-dot" style={{ ["--dot" as string]: list.color }} />
                    <span className="sidebar-label">{list.title}</span>
                  </a>
                ))}
                {lists.length === 0 && <span className="sidebar-empty">No lists yet</span>}
              </div>
            )}
          </nav>

          <div className="sidebar-foot">
            {user.is_admin && (
              <Link className={`sidebar-link${active === "admin" ? " is-active" : ""}`} href="/admin">
                <span className="sidebar-icon">&#9881;</span>
                <span className="sidebar-label">Admin</span>
              </Link>
            )}
            <Link className="sidebar-user" href="/profile" title="Your profile">
              <Avatar username={user.username} avatarUrl={user.avatar_url} extraClass="avatar-xs" />
              <span className="sidebar-label">@{user.username}</span>
            </Link>
            <div className="sidebar-signout">
              <button type="button" className="sidebar-link sidebar-signout-btn" onClick={signOut}>
                <span className="sidebar-icon">&#8617;</span>
                <span className="sidebar-label">Sign out</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="app-main">{children}</div>
      </div>
    </ShellContext.Provider>
  );
}
