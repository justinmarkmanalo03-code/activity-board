"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, PresenceDot } from "@/components/Avatar";
import { supabase } from "@/lib/supabase";
import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MAX_BYTES,
  displayDate,
  fileExtension,
  formatBytes,
  formatDue,
  normalizeLink,
} from "@/lib/format";
import type { Attachment, BoardList, BoardMember, Card, Priority } from "@/lib/types";

export interface SaveFields {
  title: string;
  description: string;
  linkUrl: string | null;
  dueDate: string | null;
  dueTime: string | null;
  priority: Priority;
  assigneeIds: string[];
}

export function CardModal({
  card,
  members,
  lists,
  canEdit,
  onClose,
  onSave,
  onDelete,
  onMoveList,
  onUpload,
  onDeleteAttachment,
  onError,
}: {
  card: Card;
  members: BoardMember[];
  lists: BoardList[];
  canEdit: boolean;
  onClose: () => void;
  onSave: (fields: SaveFields) => Promise<void>;
  onDelete: () => void;
  onMoveList: (listId: string) => void;
  onUpload: (files: File[]) => Promise<void>;
  onDeleteAttachment: (attachment: Attachment) => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [link, setLink] = useState(card.link_url ?? "");
  const [dueDate, setDueDate] = useState(card.due_date ?? "");
  const [dueTime, setDueTime] = useState(card.due_time ?? "");
  const [priority, setPriority] = useState<Priority>(card.priority);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    card.card_assignees.map((a) => a.user_id)
  );
  const [assignOpen, setAssignOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description ?? "");
    setLink(card.link_url ?? "");
    setDueDate(card.due_date ?? "");
    setDueTime(card.due_time ?? "");
    setPriority(card.priority);
    setAssigneeIds(card.card_assignees.map((a) => a.user_id));
  }, [card.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedAssignees = members.filter((m) => assigneeIds.includes(m.user_id));
  const creator = members.find((m) => m.user_id === card.created_by);
  const hasDue = Boolean(dueDate);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!canEdit || files.length === 0) return;

    const invalid: string[] = [];
    for (const file of files) {
      if (file.size > ATTACHMENT_MAX_BYTES) {
        onError(`${file.name} is larger than ${formatBytes(ATTACHMENT_MAX_BYTES)}.`);
        return;
      }
      if (!ATTACHMENT_EXTENSIONS.includes(fileExtension(file.name))) {
        invalid.push(file.name);
      }
    }
    if (invalid.length > 0) {
      onError(`Unsupported file type: ${invalid[0]}`);
      return;
    }

    setUploading(true);
    try {
      await onUpload(files);
    } finally {
      setUploading(false);
    }
  }

  async function downloadAttachment(attachment: Attachment) {
    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(attachment.storage_path, 60);
    if (error || !data) {
      onError("Could not generate a download link.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !canEdit) return;

    const rawLink = link.trim();
    const linkUrl = normalizeLink(rawLink);
    if (rawLink !== "" && !linkUrl) {
      onError("Enter a valid link, for example https://example.com/file.pdf");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description,
        linkUrl,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        priority,
        assigneeIds,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal card-detail-modal">
      <div className="modal-card card-detail-card">
        <div className="card-detail-topbar">
          <div className="card-type-chip">
            <span className="card-type-dot"></span>
            <span>Task</span>
          </div>
          <div className="card-topbar-actions">
            {canEdit && (
              <button type="button" className="icon-btn btn-danger-ghost" title="Delete task" onClick={onDelete}>
                &#128465;
              </button>
            )}
            <button type="button" className="icon-btn" title="Close" onClick={onClose}>
              &#10005;
            </button>
          </div>
        </div>

        {!canEdit && (
          <p className="readonly-note">
            <span aria-hidden="true">&#128274;</span>
            Read-only — only the creator or a manager can edit this task.
          </p>
        )}

        <form id="cardForm" className="card-detail-form" onSubmit={submit}>
          <div className="card-title-wrap">
            <input
              type="text"
              className="card-title-input"
              maxLength={200}
              placeholder="Task name..."
              required
              autoComplete="off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="card-props-table">
            <div className="card-prop-row">
              <div className="card-prop-label">
                <span className="prop-icon">&#9678;</span>
                <span className="prop-text">Status</span>
              </div>
              <div className="card-prop-control">
                <span className="status-pill-badge">{card.priority !== "none" ? card.priority : "To Do"}</span>
              </div>
            </div>

            <div className="card-prop-row">
              <div className="card-prop-label">
                <span className="prop-icon">&#128736;</span>
                <span className="prop-text">List</span>
              </div>
              <div className="card-prop-control">
                <select
                  className="priority-select-pill"
                  value={card.list_id}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next && next !== card.list_id) onMoveList(next);
                  }}
                >
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="card-prop-row">
              <div className="card-prop-label">
                <span className="prop-icon">&#128100;</span>
                <span className="prop-text">Assignees</span>
              </div>
              <div className="card-prop-control">
                <div
                  className={`assignees-trigger${canEdit ? "" : " is-disabled"}`}
                  tabIndex={canEdit ? 0 : -1}
                  role="button"
                  title={canEdit ? "Assign members" : "Read-only"}
                  onClick={() => {
                    if (canEdit) setAssignOpen((prev) => !prev);
                  }}
                  onKeyDown={(e) => {
                    if (canEdit && (e.key === "Enter" || e.key === " ")) setAssignOpen((prev) => !prev);
                  }}
                >
                  <div className="assignees-display">
                    {selectedAssignees.length === 0 ? (
                      <span className="prop-empty">Empty</span>
                    ) : (
                      selectedAssignees.map((member) => (
                        <span key={member.user_id} className="badge assignee">
                          <PresenceDot
                            userId={member.user_id}
                            lastSeen={member.profiles.last_seen}
                          />
                          @{member.profiles.username}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                {canEdit && assignOpen && (
                  <div className="assign-popover">
                    <div className="assign-popover-title">Assign to members</div>
                    <div className="assign-options">
                      {members.map((member) => (
                        <label key={member.user_id} className="assign-chip">
                          <input
                            type="checkbox"
                            checked={assigneeIds.includes(member.user_id)}
                            onChange={() => toggleAssignee(member.user_id)}
                          />
                          <span className="assign-chip-body">
                            <Avatar
                              username={member.profiles.username}
                              avatarUrl={member.profiles.avatar_url}
                              extraClass="avatar-xs"
                            />
                            <span className="assign-name">
                              @{member.profiles.username}
                              {member.role === "owner" ? " (owner)" : ""}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      style={{ marginTop: "10px", width: "100%" }}
                      onClick={() => setAssignOpen(false)}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="card-prop-row">
              <div className="card-prop-label">
                <span className="prop-icon">&#128197;</span>
                <span className="prop-text">Dates</span>
              </div>
              <div className="card-prop-control">
                <div
                  className={`dates-trigger${canEdit ? "" : " is-disabled"}`}
                  tabIndex={canEdit ? 0 : -1}
                  role="button"
                  title={canEdit ? "Set due date and time" : "Read-only"}
                  onClick={() => {
                    if (canEdit) setDatesOpen((prev) => !prev);
                  }}
                  onKeyDown={(e) => {
                    if (canEdit && (e.key === "Enter" || e.key === " ")) setDatesOpen((prev) => !prev);
                  }}
                >
                  <span className="dates-display">
                    {hasDue ? (
                      <>
                        Due <strong>{formatDue(dueDate, dueTime)}</strong>
                      </>
                    ) : (
                      <span className="prop-empty">Start &rarr; Due</span>
                    )}
                  </span>
                </div>
                {canEdit && datesOpen && (
                  <div className="dates-popover">
                    <div className="dates-popover-body">
                      <label className="date-pick-label">
                        <span>Due date</span>
                        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                      </label>
                      <label className="date-pick-label">
                        <span>Due time</span>
                        <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      style={{ marginTop: "8px", width: "100%" }}
                      onClick={() => {
                        setDueDate("");
                        setDueTime("");
                      }}
                    >
                      Clear date
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      style={{ marginTop: "8px", width: "100%" }}
                      onClick={() => setDatesOpen(false)}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="card-prop-row">
              <div className="card-prop-label">
                <span className="prop-icon">&#9873;</span>
                <span className="prop-text">Priority</span>
              </div>
              <div className="card-prop-control">
                <div className="priority-select-wrap">
                  <select
                    className="priority-select-pill"
                    value={priority}
                    disabled={!canEdit}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                  >
                    <option value="none">Empty</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card-prop-row">
              <div className="card-prop-label">
                <span className="prop-icon">&#128279;</span>
                <span className="prop-text">Link</span>
              </div>
              <div className="card-prop-control">
                {canEdit ? (
                  <input
                    type="text"
                    className="card-link-input"
                    placeholder="https://example.com/file.pdf"
                    maxLength={2000}
                    autoComplete="off"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                ) : card.link_url ? (
                  <a
                    className="card-link-view"
                    href={card.link_url}
                    target="_blank"
                    rel="noreferrer"
                    title={card.link_url}
                  >
                    {card.link_url}
                  </a>
                ) : (
                  <span className="prop-empty">Empty</span>
                )}
              </div>
            </div>

            <div className="card-prop-row">
              <div className="card-prop-label">
                <span className="prop-icon">&#128206;</span>
                <span className="prop-text">Attachments</span>
              </div>
              <div className="card-prop-control">
                {canEdit && (
                  <label className="attachment-pick-minimal" title="Upload files">
                    <input ref={fileInputRef} type="file" multiple hidden onChange={onPickFiles} />
                    <span
                      className="prop-add-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      {uploading ? "Uploading…" : "+ Add files"}
                    </span>
                  </label>
                )}
                <p className="attachment-status muted small" hidden={!uploading}>
                  Uploading files…
                </p>
              </div>
            </div>
          </div>

          <p className="attachment-limit muted small">
            Max {formatBytes(ATTACHMENT_MAX_BYTES)} per file.
          </p>

          <ul className="attachment-list card-attachments-minimal">
            {card.card_attachments.length === 0 && (
              <li className="attachment-empty muted small">No files attached yet.</li>
            )}
            {card.card_attachments.map((attachment) => (
              <li key={attachment.id} className="attachment-item">
                <button
                  type="button"
                  className="attachment-link"
                  title={`Download ${attachment.original_name}`}
                  onClick={() => downloadAttachment(attachment)}
                >
                  <span className="attachment-name">{attachment.original_name}</span>
                  <span className="attachment-meta">
                    {formatBytes(Number(attachment.size_bytes))}
                  </span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className="icon-btn attachment-remove"
                    data-attachment-delete={attachment.id}
                    title="Remove file"
                    aria-label={`Remove ${attachment.original_name}`}
                    onClick={() => onDeleteAttachment(attachment)}
                  >
                    &times;
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="card-detail-divider"></div>

          <div className="card-desc-wrap">
            <textarea
              className="card-desc-input"
              rows={3}
              maxLength={5000}
              placeholder="Add description, notes, or details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="card-detail-footer">
            <span className="muted small card-creator">
              {creator ? `@${creator.profiles.username}` : card.created_by ? "Removed member" : ""}
              {card.created_at ? ` · ${displayDate(card.created_at)}` : ""}
            </span>
            <div className="card-detail-actions">
              {canEdit ? (
                <>
                  <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-small" disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
                  Close
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
