"use client";

import { avatarInitial, isOnline } from "@/lib/format";

export function PresenceDot({
  userId,
  lastSeen,
}: {
  userId: string;
  lastSeen?: string | null;
}) {
  const online = lastSeen === undefined ? true : isOnline(lastSeen);
  return (
    <span
      className={`presence-dot ${online ? "online" : "offline"}`}
      data-presence-user={userId}
      title={online ? "Online" : "Offline"}
    />
  );
}

export function Avatar({
  username,
  avatarUrl,
  extraClass = "",
}: {
  username: string | null | undefined;
  avatarUrl?: string | null;
  extraClass?: string;
}) {
  const classes = `avatar ${extraClass}`.trim();
  return (
    <span className={classes}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={username ?? ""} loading="lazy" />
      ) : (
        <span className="avatar-initials">{avatarInitial(username)}</span>
      )}
    </span>
  );
}
