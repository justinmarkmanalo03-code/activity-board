"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface DeadlineTask {
  id: string;
  title: string;
  dueDate: string;
  dueTime: string | null;
  boardId: string | null;
  listTitle: string | null;
}

interface AssignedCardRow {
  cards: {
    id: string;
    title: string;
    due_date: string | null;
    due_time: string | null;
    lists: { id: string; board_id: string; title: string } | null;
  } | null;
}

const REFRESH_MS = 60_000;
const DISMISS_KEY = "deadlineAlertDismissed";
const notifiedKey = (day: string) => `deadlineNotified:${day}`;

function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dueTimestamp(task: DeadlineTask): number {
  const time = task.dueTime ? task.dueTime.slice(0, 5) : "23:59";
  const stamp = new Date(`${task.dueDate}T${time}:00`).getTime();
  return Number.isNaN(stamp) ? Number.POSITIVE_INFINITY : stamp;
}

function isOverdue(task: DeadlineTask): boolean {
  return dueTimestamp(task) < Date.now();
}

export function DeadlineNotifications() {
  const [userId, setUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<DeadlineTask[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const loadSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setUserId(data.session?.user.id ?? null);
      })
      .catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      if (raw) setDismissedIds(JSON.parse(raw) as string[]);
    } catch {
      // ignore storage errors
    }
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (!userId) {
      setTasks([]);
      setReady(true);
      return;
    }
    try {
      const { data } = await supabase
        .from("card_assignees")
        .select("card_id, cards ( id, title, due_date, due_time, lists ( id, board_id, title ) )")
        .eq("user_id", userId);

      const today = localDay();
      const rows = (data ?? []) as unknown as AssignedCardRow[];
      const next: DeadlineTask[] = rows
        .map((row) => row.cards)
        .filter(
          (card): card is NonNullable<AssignedCardRow["cards"]> =>
            Boolean(card && card.due_date && card.due_date <= today)
        )
        .map((card) => ({
          id: card.id,
          title: card.title,
          dueDate: card.due_date as string,
          dueTime: card.due_time,
          boardId: card.lists?.board_id ?? null,
          listTitle: card.lists?.title ?? null,
        }))
        .sort((a, b) => {
          if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
          return (a.dueTime ?? "23:59").localeCompare(b.dueTime ?? "23:59");
        });

      if (seq === loadSeq.current) setTasks(next);
    } catch {
      // Offline or request failed — keep the last known reminders.
    } finally {
      setReady(true);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    if (!userId) return;
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, userId]);

  useEffect(() => {
    if (permission !== "granted" || tasks.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) return;

        const key = notifiedKey(localDay());
        let notified: string[] = [];
        try {
          notified = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
        } catch {
          notified = [];
        }

        if (tasks.every((task) => notified.includes(task.id))) return;

        const overdueCount = tasks.filter(isOverdue).length;
        const title =
          overdueCount > 0
            ? `Overdue task${overdueCount === 1 ? "" : "s"}`
            : "Tasks due today";
        const body =
          tasks.length === 1
            ? `${tasks[0].title}${tasks[0].listTitle ? ` · ${tasks[0].listTitle}` : ""}`
            : `${tasks.length} tasks need attention: ${tasks
                .slice(0, 2)
                .map((task) => task.title)
                .join(", ")}${tasks.length > 2 ? "…" : ""}`;

        const options: NotificationOptions & { renotify?: boolean } = {
          body,
          icon: "/designer.png",
          badge: "/designer.png",
          tag: "activity-board-deadlines",
          renotify: true,
          data: { url: tasks[0].boardId ? `/board/${tasks[0].boardId}` : "/dashboard" },
        };
        await registration.showNotification(title, options);

        try {
          localStorage.setItem(
            key,
            JSON.stringify(Array.from(new Set([...notified, ...tasks.map((task) => task.id)])))
          );
        } catch {
          // ignore storage errors
        }
      } catch {
        // Notification could not be shown (unsupported browser, SW not ready).
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [permission, tasks]);

  const visible = ready && tasks.some((task) => !dismissedIds.includes(task.id));
  if (!visible) return null;

  const overdue = tasks.filter(isOverdue);
  const dueTodayCount = tasks.length - overdue.length;
  const headingParts: string[] = [];
  if (overdue.length > 0) {
    headingParts.push(`${overdue.length} overdue`);
  }
  if (dueTodayCount > 0) {
    headingParts.push(`${dueTodayCount} due today`);
  }
  const heading = headingParts.join(" · ");
  const preview = tasks.slice(0, 2);
  const target = tasks[0].boardId ? `/board/${tasks[0].boardId}` : "/dashboard";
  const canAsk = permission === "default";

  function dismiss() {
    const ids = tasks.map((task) => task.id);
    setDismissedIds(ids);
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify(ids));
    } catch {
      // ignore storage errors
    }
  }

  async function enableAlerts() {
    if (!("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch {
      // ignore permission errors
    }
  }

  return (
    <div className="deadline-alert" role="alert" aria-live="polite">
      <img className="deadline-alert-logo" src="/designer.png" alt="" />
      <div className="deadline-alert-body">
        <div className="deadline-alert-top">
          <strong>Deadline reminder</strong>
          <span>Activity Board · now</span>
        </div>
        <p className="deadline-alert-heading">{heading}</p>
        <ul className="deadline-alert-list">
          {preview.map((task) => (
            <li key={task.id}>
              <span>{task.title}</span>
              {task.listTitle && <em>{task.listTitle}</em>}
            </li>
          ))}
        </ul>
        {tasks.length > preview.length && (
          <span className="deadline-alert-more">+{tasks.length - preview.length} more</span>
        )}
      </div>
      <div className="deadline-alert-actions">
        {canAsk && (
          <button type="button" className="deadline-alert-enable" onClick={enableAlerts}>
            Enable alerts
          </button>
        )}
        <a className="deadline-alert-view" href={target} onClick={dismiss}>
          View
        </a>
        <button
          type="button"
          className="deadline-alert-close"
          aria-label="Dismiss notification"
          onClick={dismiss}
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}
