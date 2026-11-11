"use client";

import { useOnline } from "@/lib/useOnline";

export function OfflineIndicator() {
  const { online, syncing, pending } = useOnline();

  if (online && pending === 0) return null;

  return (
    <div
      className={`offline-banner ${!online ? "offline" : "syncing"}`}
      role="status"
      aria-label={!online ? "You are offline. Changes will be saved when you reconnect." : `Syncing ${pending} pending change${pending !== 1 ? "s" : ""}...`}
    >
      <span
        className="offline-dot"
        style={{ background: !online ? "#ef4444" : "#22c55e" }}
      ></span>
      {!online ? (
        <>
          <strong>Offline</strong>
          <span> — Working offline. Changes will sync when you reconnect.</span>
        </>
      ) : (
        <>
          <strong>Syncing…</strong>
          <span>{pending} change{pending !== 1 ? "s" : ""} pending.</span>
        </>
      )}
    </div>
  );
}
