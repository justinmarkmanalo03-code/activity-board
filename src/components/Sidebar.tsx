"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { BoardList, BoardSummary, Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";

const SIDEBAR_KEY = "sidebarCollapsed";

type IconName = "home" | "user" | "gear" | "signout" | "chevron" | "menu";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v9.5a1 1 0 0 0 1 1H10v-5.5h4v5.5h3.5a1 1 0 0 0 1-1V10" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20.5c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5" />
        </svg>
      );
    case "gear":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      );
    case "signout":
      return (
        <svg {...common}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...common}>
          <path d="m15 6-6 6 6 6" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      );
  }
}

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
      <Icon name="menu" />
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
            <span className="workspace-badge">
              <img src="/designer.png" alt="Activity Board logo" />
            </span>
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
              <Icon name="chevron" />
            </button>
          </div>

          <nav className="sidebar-nav">
            <Link className={`sidebar-link${active === "dashboard" ? " is-active" : ""}`} href="/dashboard">
              <span className="sidebar-icon"><Icon name="home" /></span>
              <span className="sidebar-label">Home</span>
            </Link>
            <Link className={`sidebar-link${active === "profile" ? " is-active" : ""}`} href="/profile">
              <span className="sidebar-icon"><Icon name="user" /></span>
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
                <span className="sidebar-icon"><Icon name="gear" /></span>
                <span className="sidebar-label">Admin</span>
              </Link>
            )}
            <Link className="sidebar-user" href="/profile" title="Your profile">
              <Avatar username={user.username} avatarUrl={user.avatar_url} extraClass="avatar-xs" />
              <span className="sidebar-label">@{user.username}</span>
            </Link>
            <div className="sidebar-signout">
              <button type="button" className="sidebar-link sidebar-signout-btn" onClick={signOut}>
                <span className="sidebar-icon"><Icon name="signout" /></span>
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
