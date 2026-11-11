"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, SidebarToggleButton } from "@/components/Sidebar";
import { Avatar, PresenceDot } from "@/components/Avatar";
import { usePresenceHeartbeat, useSession } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";
import { AVATAR_MAX_BYTES, formatBytes } from "@/lib/format";
import type { BoardSummary } from "@/lib/types";

interface BoardRow {
  id: string;
  title: string;
  created_at: string;
  owner_id: string;
  board_members: { user_id: string; role: "owner" | "manager" | "member" }[];
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

function ProfileContent({
  profile,
  boards,
  assignedCount,
  onAvatarSaved,
}: {
  profile: { id: string; username: string; avatar_url: string | null; created_at: string; is_admin: boolean };
  boards: BoardSummary[];
  assignedCount: number;
  onAvatarSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ownedCount = boards.filter((b) => b.owner_id === b.id || b.role === "owner").length;
  const joinedDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Recent";

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setError("");
    if (!picked) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (picked.size > AVATAR_MAX_BYTES) {
      setError(`Avatar images must be ${formatBytes(AVATAR_MAX_BYTES)} or smaller.`);
      e.target.value = "";
      setFile(null);
      setPreview(null);
      return;
    }
    const ext = MIME_EXTENSIONS[picked.type];
    if (!ext) {
      setError("Upload a valid JPG, PNG, GIF, or WebP image.");
      e.target.value = "";
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(picked);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string | null);
    reader.readAsDataURL(picked);
  }

  async function saveAvatar(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose an image to upload.");
      return;
    }

    const ext = MIME_EXTENSIONS[file.type];
    if (!ext) {
      setError("Upload a valid JPG, PNG, GIF, or WebP image.");
      return;
    }

    setRemoving(true);
    setError("");
    setSuccess("");

    const path = `${profile.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setError("Could not save your avatar. Please try again.");
      setRemoving(false);
      return;
    }

    const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicData.publicUrl })
      .eq("id", profile.id);
    if (updateError) {
      setError("Could not update your profile. Please try again.");
      setRemoving(false);
      return;
    }

    // Clean up any older avatar objects from previous extensions.
    const { data: objects } = await supabase.storage.from("avatars").list(profile.id);
    for (const object of objects ?? []) {
      if (object.name !== `avatar.${ext}`) {
        await supabase.storage.from("avatars").remove([`${profile.id}/${object.name}`]);
      }
    }

    setAvatarUrl(publicData.publicUrl);
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSuccess("Your avatar has been updated!");
    setRemoving(false);
    onAvatarSaved();
  }

  async function removeAvatar() {
    if (!avatarUrl || !window.confirm("Are you sure you want to remove your profile photo and reset to your initials?")) {
      return;
    }
    setRemoving(true);
    const { data: objects } = await supabase.storage.from("avatars").list(profile.id);
    for (const object of objects ?? []) {
      await supabase.storage.from("avatars").remove([`${profile.id}/${object.name}`]);
    }
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
    setAvatarUrl(null);
    setSuccess("Your avatar was removed and reset to your initials.");
    setRemoving(false);
    onAvatarSaved();
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const formData = new FormData(e.currentTarget);
    const newPassword = String(formData.get("new_password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
      return;
    }
    e.currentTarget.reset();
    setSuccess("Your password has been updated successfully!");
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <SidebarToggleButton />
          <div className="brand">Activity Board</div>
        </div>
        <div className="topbar-right">
          <span className="user-chip">@{profile.username}</span>
        </div>
      </header>

      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Account Settings</p>
            <h1>Your Profile</h1>
            <p className="muted">Manage your personal identity, avatar image, and account credentials.</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="profile-grid">
          <aside className="profile-card-col">
            <section className="profile-summary-card">
              <div className="profile-avatar-lg">
                <Avatar username={profile.username} avatarUrl={preview ?? avatarUrl} />
                <PresenceDot userId={profile.id} />
              </div>
              <h2 className="profile-summary-name">@{profile.username}</h2>
              <span className="profile-role-badge">
                {profile.is_admin ? "Administrator" : "Workspace Member"}
              </span>

              <div className="profile-stats-row">
                <div className="profile-stat-box">
                  <span className="profile-stat-val">{boards.length}</span>
                  <span className="profile-stat-lbl">Boards</span>
                </div>
                <div className="profile-stat-box">
                  <span className="profile-stat-val">{ownedCount}</span>
                  <span className="profile-stat-lbl">Owned</span>
                </div>
                <div className="profile-stat-box">
                  <span className="profile-stat-val">{assignedCount}</span>
                  <span className="profile-stat-lbl">Assigned</span>
                </div>
              </div>

              <div className="profile-details-list">
                <div className="profile-detail-item">
                  <span className="profile-detail-label">Username</span>
                  <span className="profile-detail-value">@{profile.username}</span>
                </div>
                <div className="profile-detail-item">
                  <span className="profile-detail-label">Member Since</span>
                  <span className="profile-detail-value">{joinedDate}</span>
                </div>
                <div className="profile-detail-item">
                  <span className="profile-detail-label">Status</span>
                  <span
                    className="profile-detail-value"
                    style={{ color: "#16a34a", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#22c55e",
                        display: "inline-block",
                      }}
                    ></span>
                    Active
                  </span>
                </div>
              </div>
            </section>
          </aside>

          <div className="profile-card-col">
            <section className="profile-panel">
              <div className="profile-panel-head">
                <h2>Profile Avatar</h2>
                <p>Upload a custom image to represent yourself across all boards and card assignments.</p>
              </div>

              <form onSubmit={saveAvatar}>
                <div className="avatar-preview-box">
                  <span>
                    <Avatar username={profile.username} avatarUrl={preview ?? avatarUrl} extraClass="avatar-sm" />
                  </span>
                  <div>
                    <strong>{avatarUrl ? "Custom avatar active" : "Default initials active"}</strong>
                    <p className="muted small">Select a new image below to preview and save.</p>
                  </div>
                </div>

                <label className="avatar-upload-zone">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    style={{ display: "none" }}
                    required
                    onChange={onPickImage}
                  />
                  <span className="avatar-upload-icon">&#128247;</span>
                  <span className="avatar-upload-prompt">
                    <span>
                      <strong>Click to browse</strong> or drag and drop your photo
                    </span>
                  </span>
                  <span className="muted small">Supported: JPG, PNG, GIF, WebP (Max 2 MB)</span>
                </label>

                <div className="profile-actions-row">
                  <button type="submit" className="btn btn-primary" disabled={removing}>
                    Save Avatar
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-small"
                      onClick={removeAvatar}
                      disabled={removing}
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="profile-panel">
              <div className="profile-panel-head">
                <h2>Password &amp; Security</h2>
                <p>Ensure your account remains secure by choosing a strong password with at least 8 characters.</p>
              </div>

              <form className="stack" style={{ marginTop: "16px" }} onSubmit={changePassword}>
                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <label>
                    New Password
                    <input
                      type="password"
                      name="new_password"
                      minLength={8}
                      autoComplete="new-password"
                      required
                      placeholder="Min. 8 characters"
                    />
                  </label>
                  <label>
                    Confirm New Password
                    <input
                      type="password"
                      name="confirm_password"
                      minLength={8}
                      autoComplete="new-password"
                      required
                      placeholder="Repeat new password"
                    />
                  </label>
                </div>
                <div className="profile-actions-row">
                  <button type="submit" className="btn btn-primary">
                    Update Password
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { session, profile, loading, refreshProfile } = useSession();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [assignedCount, setAssignedCount] = useState(0);

  useEffect(() => {
    document.body.className = "";
  }, []);

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  usePresenceHeartbeat(Boolean(session));

  const loadStats = useCallback(async () => {
    if (!session?.user) return;
    const uid = session.user.id;

    const { data } = await supabase.from("boards").select(`
      id, title, created_at, owner_id,
      board_members ( user_id, role )
    `);
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
      .filter((x): x is BoardSummary => x !== null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    setBoards(summaries);

    const { count } = await supabase
      .from("card_assignees")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", uid);
    setAssignedCount(count ?? 0);
  }, [session]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading || !boards) return null;
  if (!session || !profile) {
    return (
      <main className="redirect-screen">
        <div className="auth-card">
          <p className="lead">Redirecting…</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="bg-decor" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <Sidebar active="profile" user={profile} boards={boards}>
        <ProfileContent profile={profile} boards={boards} assignedCount={assignedCount} onAvatarSaved={refreshProfile} />
      </Sidebar>
    </>
  );
}
