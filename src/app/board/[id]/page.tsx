"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Sidebar, SidebarToggleButton } from "@/components/Sidebar";
import { Avatar, PresenceDot } from "@/components/Avatar";
import { BoardView } from "@/components/board/BoardView";
import { CardModal } from "@/components/board/CardModal";
import type { SaveFields } from "@/components/board/CardModal";
import { ShareModal } from "@/components/board/ShareModal";
import { ConfirmModal, PromptModal, Toast, useToast } from "@/components/Modals";
import { usePresenceHeartbeat, useSession } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";
import { randomHex, fileExtension } from "@/lib/format";
import type { Attachment, Board, BoardList, BoardMember, BoardSummary, Card } from "@/lib/types";

interface BoardRow {
  id: string;
  title: string;
  created_at: string;
  owner_id: string;
  board_members: { user_id: string; role: "owner" | "manager" | "member" }[];
}

type ConfirmState = { message: string; onConfirm: () => void } | null;
type PromptState = {
  title: string;
  label: string;
  value: string;
  color: string | null;
  maxLength: number;
  onOk: (value: string, color: string) => void;
} | null;

export default function BoardPage() {
  const params = useParams<{ id: string }>();
  const boardId = params.id;
  const router = useRouter();

  const { session, profile, loading } = useSession();
  const { message: toastMessage, show: showToast } = useToast();

  const [board, setBoard] = useState<Board | null>(null);
  const [lists, setLists] = useState<BoardList[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [navBoards, setNavBoards] = useState<BoardSummary[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [promptState, setPromptState] = useState<PromptState>(null);
  const refreshTimer = useRef<number | null>(null);
  const draggingRef = useRef(false);

  const myUserId = session?.user.id ?? null;
  const myMembership = myUserId ? members.find((m) => m.user_id === myUserId) : undefined;
  const myRole = myMembership?.role;
  const isOwner = myRole === "owner";
  const canManage = myRole === "owner" || myRole === "manager";

  useEffect(() => {
    document.body.className = "board-body";
    return () => {
      document.body.className = "";
    };
  }, []);

  usePresenceHeartbeat(Boolean(session));

  // ---------- Data loading ----------

  const loadBoard = useCallback(async () => {
    if (!session?.user || !boardId) return;

    const [{ data: boardData }, { data: listsData }, { data: cardsData }, { data: membersData }] =
      await Promise.all([
        supabase.from("boards").select("id, title, owner_id, created_at").eq("id", boardId).maybeSingle(),
        supabase
          .from("lists")
          .select("id, board_id, title, color, position")
          .eq("board_id", boardId)
          .order("position")
          .order("id", { ascending: true }),
        supabase
          .from("cards")
          .select(`
            id, list_id, title, description, link_url, created_by, due_date, due_time, priority, position, created_at,
            card_assignees ( user_id, profiles ( id, username, avatar_url, last_seen ) ),
            card_attachments ( id, card_id, uploaded_by, storage_path, original_name, mime_type, size_bytes, created_at )
          `)
          .order("position")
          .order("id", { ascending: true }),
        supabase
          .from("board_members")
          .select("user_id, role, profiles ( id, username, avatar_url, last_seen, is_admin )")
          .eq("board_id", boardId),
      ]);

    if (!boardData) {
      setNotFound(true);
      return;
    }

    const listIds = new Set((listsData ?? []).map((l) => l.id));
    const boardCards = ((cardsData ?? []) as unknown as Card[]).filter((card) => listIds.has(card.list_id));

    const sortedMembers = ((membersData ?? []) as unknown as BoardMember[]).sort((a, b) =>
      a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.profiles.username.localeCompare(b.profiles.username)
    );

    setBoard(boardData as Board);
    setLists((listsData ?? []) as BoardList[]);
    setCards(boardCards);
    setMembers(sortedMembers);
  }, [session, boardId]);

  const loadNavBoards = useCallback(async () => {
    if (!session?.user) return;
    const uid = session.user.id;
    const { data } = await supabase
      .from("boards")
      .select("id, title, created_at, owner_id, board_members ( user_id, role )");
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
    setNavBoards(summaries);
  }, [session]);

  useEffect(() => {
    loadBoard();
    loadNavBoards();
  }, [loadBoard, loadNavBoards]);

  // ---------- Realtime ----------

  useEffect(() => {
    if (!session?.user || !boardId) return;

    const scheduleRefresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        if (!draggingRef.current) loadBoard();
      }, 400);
    };

    const channel = supabase
      .channel(`board:${boardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lists", filter: `board_id=eq.${boardId}` },
        scheduleRefresh
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "card_assignees" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "card_attachments" }, scheduleRefresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "board_members", filter: `board_id=eq.${boardId}` },
        scheduleRefresh
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const updated = payload.new as { id: string; last_seen: string | null; avatar_url: string | null };
        setMembers((prev) =>
          prev.map((member) =>
            member.user_id === updated.id
              ? {
                  ...member,
                  profiles: {
                    ...member.profiles,
                    last_seen: updated.last_seen,
                    avatar_url: updated.avatar_url,
                  },
                }
              : member
          )
        );
        setCards((prev) =>
          prev.map((card) => ({
            ...card,
            card_assignees: card.card_assignees.map((assignee) =>
              assignee.user_id === updated.id
                ? {
                    ...assignee,
                    profiles: {
                      ...assignee.profiles,
                      last_seen: updated.last_seen,
                      avatar_url: updated.avatar_url,
                    },
                  }
                : assignee
            ),
          }))
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [session, boardId, loadBoard]);

  // ---------- Derived ----------

  const cardsByList = useMemo(() => {
    const map: Record<string, Card[]> = {};
    for (const list of lists) map[list.id] = [];
    for (const card of cards) {
      if (!map[card.list_id]) map[card.list_id] = [];
      map[card.list_id].push(card);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    }
    return map;
  }, [lists, cards]);

  const openCard = openCardId ? cards.find((c) => c.id === openCardId) ?? null : null;

  // ---------- Board mutations ----------

  function deleteBoard() {
    if (!board) return;
    setConfirmState({
      message: "Delete this board with all of its lists, cards, and attachments? This cannot be undone.",
      onConfirm: async () => {
        setConfirmState(null);
        // Best-effort removal of attachment files from storage.
        const { data: folder } = await supabase.storage.from("attachments").list(board.id);
        if (folder && folder.length > 0) {
          await supabase.storage
            .from("attachments")
            .remove(folder.map((object) => `${board.id}/${object.name}`));
        }
        const { error } = await supabase.from("boards").delete().eq("id", board.id);
        if (error) showToast("Could not delete the board.");
        else router.push("/dashboard");
      },
    });
  }

  async function share(username: string) {
    const { data: target, error: lookupError } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .maybeSingle();

    if (lookupError || !target) {
      showToast("No user with that username was found.");
      return;
    }

    const { error } = await supabase
      .from("board_members")
      .insert({ board_id: boardId, user_id: target.id, role: "member" });

    if (error) {
      showToast(error.code === "23505" ? "That user is already a member." : "Could not add the member.");
      return;
    }
    showToast(`@${target.username} was added to the board.`);
    loadBoard();
  }

  async function unshare(userId: string) {
    const { error } = await supabase
      .from("board_members")
      .delete()
      .eq("board_id", boardId)
      .eq("user_id", userId);
    if (error) showToast("Could not remove the member.");
    else showToast("Member removed.");
    loadBoard();
  }

  async function toggleRole(userId: string, role: "manager" | "member") {
    const { error } = await supabase
      .from("board_members")
      .update({ role })
      .eq("board_id", boardId)
      .eq("user_id", userId);
    if (error) showToast("Only the owner can change roles.");
    else showToast(role === "manager" ? "Manager power granted." : "Manager power revoked.");
    loadBoard();
  }

  // ---------- List mutations ----------

  async function addList(title: string) {
    const position = lists.length > 0 ? Math.max(...lists.map((l) => l.position)) + 1 : 1;
    const { error } = await supabase
      .from("lists")
      .insert({ board_id: boardId, title, position });
    if (error) showToast("Could not create the list.");
    loadBoard();
  }

  function renameList(list: BoardList) {
    setPromptState({
      title: "Rename list",
      label: "List name",
      value: list.title,
      color: list.color,
      maxLength: 100,
      onOk: async (value, color) => {
        setPromptState(null);
        const { error } = await supabase
          .from("lists")
          .update({ title: value, color })
          .eq("id", list.id);
        if (error) showToast("Could not rename the list.");
        loadBoard();
      },
    });
  }

  function deleteList(list: BoardList) {
    setConfirmState({
      message: `Delete the list "${list.title}"? Lists can only be deleted while empty.`,
      onConfirm: async () => {
        setConfirmState(null);
        const { error } = await supabase.from("lists").delete().eq("id", list.id);
        if (error) showToast("Could not delete the list. It may still contain cards.");
        else showToast("List deleted.");
        loadBoard();
      },
    });
  }

  // ---------- Card mutations ----------

  async function addCard(listId: string, title: string) {
    const existing = cardsByList[listId] ?? [];
    const position = existing.length > 0 ? Math.max(...existing.map((c) => c.position)) + 1 : 1;
    const { error } = await supabase
      .from("cards")
      .insert({ list_id: listId, title, created_by: myUserId, position });
    if (error) showToast("Could not create the card.");
    loadBoard();
  }

  async function saveCard(fields: SaveFields) {
    if (!openCard) return;
    if (openCard.created_by !== myUserId && !canManage) {
      showToast("Only the card creator or a manager can edit this card.");
      return;
    }
    const cardId = openCard.id;

    const { error } = await supabase
      .from("cards")
      .update({
        title: fields.title,
        description: fields.description,
        link_url: fields.linkUrl,
        due_date: fields.dueDate,
        due_time: fields.dueTime,
        priority: fields.priority,
      })
      .eq("id", cardId);
    if (error) {
      showToast("Could not save the card.");
      return;
    }

    const currentIds = openCard.card_assignees.map((a) => a.user_id);
    const removed = currentIds.filter((id) => !fields.assigneeIds.includes(id));
    const added = fields.assigneeIds.filter((id) => !currentIds.includes(id));

    if (removed.length > 0) {
      await supabase.from("card_assignees").delete().eq("card_id", cardId).in("user_id", removed);
    }
    if (added.length > 0) {
      await supabase.from("card_assignees").insert(added.map((user_id) => ({ card_id: cardId, user_id })));
    }

    setOpenCardId(null);
    showToast("Card saved.");
    loadBoard();
  }

  function deleteCard(cardId: string) {
    setConfirmState({
      message: "Delete this card? This cannot be undone.",
      onConfirm: async () => {
        setConfirmState(null);
        setOpenCardId(null);
        const { error } = await supabase.from("cards").delete().eq("id", cardId);
        if (error) showToast("You can only delete cards you created.");
        else showToast("Card deleted.");
        loadBoard();
      },
    });
  }

  async function moveCard(cardId: string, toListId: string, beforeCardId: string | null) {
    const movingCard = cards.find((c) => c.id === cardId);
    if (movingCard && movingCard.created_by !== myUserId && !canManage) {
      showToast("Only the card creator or a manager can move this card.");
      return;
    }
    draggingRef.current = true;

    // Optimistic local reorder.
    setCards((prev) => {
      const moving = prev.find((c) => c.id === cardId);
      if (!moving) return prev;
      const target = (prev.filter((c) => c.list_id === toListId && c.id !== cardId)).sort(
        (a, b) => a.position - b.position || a.id.localeCompare(b.id)
      );
      const index = beforeCardId ? target.findIndex((c) => c.id === beforeCardId) : target.length;
      const insertAt = index === -1 ? target.length : index;
      target.splice(insertAt, 0, { ...moving, list_id: toListId });

      const updates = new Map<string, { list_id: string; position: number }>();
      target.forEach((card, i) => updates.set(card.id, { list_id: toListId, position: i + 1 }));
      const source = prev.filter((c) => c.list_id === moving.list_id && c.id !== cardId);
      if (moving.list_id !== toListId) {
        source
          .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
          .forEach((card, i) => updates.set(card.id, { list_id: moving.list_id, position: i + 1 }));
      }

      return prev.map((card) => {
        const update = updates.get(card.id);
        return update ? { ...card, ...update } : card;
      });
    });

    // Persist: rebuild target (and source) ordering.
    const source = cards.find((c) => c.id === cardId);
    const sourceListId = source?.list_id ?? toListId;

    const targetCards = cards
      .filter((c) => c.list_id === toListId && c.id !== cardId)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    const index = beforeCardId ? targetCards.findIndex((c) => c.id === beforeCardId) : targetCards.length;
    targetCards.splice(index === -1 ? targetCards.length : index, 0, source!);

    const ops: Promise<unknown>[] = targetCards.map((card, i) =>
      Promise.resolve(
        supabase.from("cards").update({ list_id: toListId, position: i + 1 }).eq("id", card.id)
      )
    );

    if (sourceListId !== toListId) {
      const sourceCards = cards
        .filter((c) => c.list_id === sourceListId && c.id !== cardId)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      sourceCards.forEach((card, i) => {
        ops.push(
          Promise.resolve(supabase.from("cards").update({ position: i + 1 }).eq("id", card.id))
        );
      });
    }

    await Promise.all(ops);
    draggingRef.current = false;
    loadBoard();
  }

  // ---------- Attachments ----------

  async function uploadAttachments(files: File[]) {
    if (!openCard) return;
    const cardId = openCard.id;

    for (const file of files) {
      const ext = fileExtension(file.name) || "bin";
      const path = `${boardId}/${cardId}/${randomHex(16)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(path, file, { contentType: file.type || undefined });
      if (uploadError) {
        showToast(`Could not upload ${file.name}.`);
        continue;
      }
      const { error: insertError } = await supabase.from("card_attachments").insert({
        card_id: cardId,
        uploaded_by: myUserId,
        storage_path: path,
        original_name: file.name.slice(0, 180),
        mime_type: file.type || null,
        size_bytes: file.size,
      });
      if (insertError) {
        await supabase.storage.from("attachments").remove([path]);
        showToast(`Could not attach ${file.name}.`);
      }
    }
    showToast("Files attached.");
    loadBoard();
  }

  async function deleteAttachment(attachment: Attachment) {
    await supabase.storage.from("attachments").remove([attachment.storage_path]);
    const { error } = await supabase.from("card_attachments").delete().eq("id", attachment.id);
    if (error) showToast("Could not delete the attachment.");
    else showToast("Attachment deleted.");
    loadBoard();
  }

  // ---------- Render ----------

  if (loading) return null;

  if (!session || !profile) {
    return (
      <main className="redirect-screen">
        <div className="auth-card">
          <p className="lead">Redirecting…</p>
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="redirect-screen">
        <div className="auth-card">
          <div className="brand">Activity Board</div>
          <h1>Board not found.</h1>
          <p className="lead">
            It may have been deleted, or you have not been added as a member.
          </p>
        </div>
      </main>
    );
  }

  if (!board) return null;

  const onlineOthers = members.filter(
    (m) => m.user_id !== myUserId && m.profiles.last_seen && Date.now() - new Date(m.profiles.last_seen).getTime() <= 120 * 1000
  );

  return (
    <>
      <div className="bg-decor" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <Sidebar active="board" user={profile} boards={navBoards} lists={lists} showLists boardId={boardId}>
        <header className="board-topbar">
          <SidebarToggleButton />
          <h1 id="boardTitle">{board.title}</h1>
          <div className="board-actions">
            <div className="active-member-avatars" aria-label="Online board members">
              {members
                .filter((m) => m.user_id !== myUserId)
                .map((member) => (
                  <span
                    key={member.user_id}
                    className="active-member"
                    data-active-user={member.user_id}
                    data-active-name={`@${member.profiles.username}`}
                    title={`@${member.profiles.username} is online`}
                    hidden={!onlineOthers.some((o) => o.user_id === member.user_id)}
                  >
                    <span className="avatar-wrap">
                      <Avatar
                        username={member.profiles.username}
                        avatarUrl={member.profiles.avatar_url}
                        extraClass="avatar-sm"
                      />
                      <PresenceDot userId={member.user_id} lastSeen={member.profiles.last_seen} />
                    </span>
                  </span>
                ))}
            </div>
            <span className="members-chip">
              {members.length} member{members.length === 1 ? "" : "s"}
            </span>
            {canManage && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setShareOpen(true)}
              >
                Share
              </button>
            )}
            {isOwner && (
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setSettingsOpen(true)}>
                Settings
              </button>
            )}
          </div>
        </header>

        <BoardView
          lists={lists}
          cardsByList={cardsByList}
          myUserId={myUserId ?? ""}
          canManage={canManage}
          onCardClick={(cardId) => setOpenCardId(cardId)}
          onAddCard={addCard}
          onRenameList={renameList}
          onDeleteList={deleteList}
          onAddList={addList}
          onMoveCard={moveCard}
        />
      </Sidebar>

      {openCard && (
        <CardModal
          card={openCard}
          members={members}
          lists={lists}
          canEdit={openCard.created_by === myUserId || canManage}
          onClose={() => setOpenCardId(null)}
          onSave={saveCard}
          onDelete={() => deleteCard(openCard.id)}
          onMoveList={(listId) => moveCard(openCard.id, listId, null)}
          onUpload={uploadAttachments}
          onDeleteAttachment={deleteAttachment}
          onError={showToast}
        />
      )}

      {shareOpen && canManage && (
        <ShareModal
          members={members}
          isOwner={isOwner}
          myRole={myRole ?? "member"}
          onShare={share}
          onUnshare={unshare}
          onToggleRole={toggleRole}
          onClose={() => setShareOpen(false)}
          onError={showToast}
        />
      )}

      {settingsOpen && isOwner && (
        <div className="confirm-overlay">
          <div className="modal-card confirm-card" role="dialog" aria-modal="true">
            <header className="modal-head">
              <h2>Board settings</h2>
              <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setSettingsOpen(false)}>
                &#10005;
              </button>
            </header>
            <div className="modal-actions" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "16px 20px" }}>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => {
                  setSettingsOpen(false);
                  setPromptState({
                    title: "Rename board",
                    label: "Board name",
                    value: board?.title ?? "",
                    color: null,
                    maxLength: 100,
                    onOk: async (value) => {
                      setPromptState(null);
                      const { error } = await supabase.from("boards").update({ title: value }).eq("id", board!.id);
                      if (error) showToast("Could not rename the board.");
                      else showToast("Board renamed.");
                      loadBoard();
                      loadNavBoards();
                    },
                  });
                }}
              >
                Rename board
              </button>
              <button
                type="button"
                className="btn btn-danger-ghost btn-small"
                onClick={() => {
                  setSettingsOpen(false);
                  deleteBoard();
                }}
              >
                Delete board
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {promptState && (
        <PromptModal
          title={promptState.title}
          label={promptState.label}
          value={promptState.value}
          color={promptState.color}
          maxLength={promptState.maxLength}
          onOk={promptState.onOk}
          onCancel={() => setPromptState(null)}
        />
      )}

      <Toast message={toastMessage} />
    </>
  );
}
