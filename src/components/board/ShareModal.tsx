"use client";

import { useState } from "react";
import { Avatar, PresenceDot } from "@/components/Avatar";
import { roleLabel } from "@/lib/format";
import type { BoardMember, Role } from "@/lib/types";

export function ShareModal({
  members,
  isOwner,
  myRole,
  onShare,
  onUnshare,
  onToggleRole,
  onClose,
  onError,
}: {
  members: BoardMember[];
  isOwner: boolean;
  myRole: Role;
  onShare: (username: string) => Promise<void>;
  onUnshare: (userId: string) => void;
  onToggleRole: (userId: string, role: "manager" | "member") => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onShare(name);
      setUsername("");
    } finally {
      setBusy(false);
    }
  }

  const canManage = myRole === "owner" || myRole === "manager";

  return (
    <div className="modal">
      <div className="modal-card">
        <header className="modal-head">
          <h2>Share board</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            &#10005;
          </button>
        </header>

        <form className="inline-form" onSubmit={submit}>
          <input
            type="text"
            maxLength={30}
            placeholder="Username"
            autoComplete="off"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </form>

        <p className="muted small">
          {isOwner
            ? "Members can edit lists and cards. Give someone manager power if you trust them to add people, rename the board, and edit cards. Only you can delete the board or change who is a manager."
            : "You are a manager of this board. You can add members, rename the board, and edit lists and cards."}
        </p>

        <ul className="member-list">
          {members.map((member) => {
            const isMemberOwner = member.role === "owner";
            const isMemberManager = member.role === "manager";
            const canRemove =
              !isMemberOwner && (isOwner || (!isMemberManager && canManage));
            return (
              <li key={member.user_id} data-user-id={member.user_id} data-role={member.role}>
                <span className="member-identity">
                  <span className="avatar-wrap">
                    <Avatar
                      username={member.profiles.username}
                      avatarUrl={member.profiles.avatar_url}
                      extraClass="avatar-sm"
                    />
                    <PresenceDot userId={member.user_id} lastSeen={member.profiles.last_seen} />
                  </span>
                  <span className="member-name">@{member.profiles.username}</span>
                </span>
                <span className={`role-badge role-${member.role}`}>{roleLabel(member.role)}</span>
                {isOwner && !isMemberOwner && (
                  <button
                    type="button"
                    className={`role-toggle${isMemberManager ? " is-active" : ""}`}
                    data-member-role={isMemberManager ? "member" : "manager"}
                    data-user-id={member.user_id}
                    title={isMemberManager ? "Revoke manager power" : "Give manager power"}
                    onClick={() => onToggleRole(member.user_id, isMemberManager ? "member" : "manager")}
                  >
                    {isMemberManager ? "Revoke power" : "Give power"}
                  </button>
                )}
                {canRemove && (
                  <button
                    type="button"
                    className="icon-btn"
                    data-remove-member={member.user_id}
                    title="Remove member"
                    onClick={() => onUnshare(member.user_id)}
                  >
                    &#10005;
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
