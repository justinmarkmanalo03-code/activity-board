"use client";

import { useState } from "react";
import { PresenceDot } from "@/components/Avatar";
import { formatDue } from "@/lib/format";
import type { BoardList, Card } from "@/lib/types";

export type ViewMode = "board" | "list";

export function BoardView({
  lists,
  cardsByList,
  myUserId,
  canManage,
  onCardClick,
  onAddCard,
  onRenameList,
  onDeleteList,
  onAddList,
  onMoveCard,
}: {
  lists: BoardList[];
  cardsByList: Record<string, Card[]>;
  myUserId: string;
  canManage: boolean;
  onCardClick: (cardId: string) => void;
  onAddCard: (listId: string, title: string) => void;
  onRenameList: (list: BoardList) => void;
  onDeleteList: (list: BoardList) => void;
  onAddList: (title: string) => void;
  onMoveCard: (cardId: string, toListId: string, beforeCardId: string | null) => void;
}) {
  const [view, setView] = useState<ViewMode>("board");
  const [dragging, setDragging] = useState<{ cardId: string; fromListId: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  function handleDrop(toListId: string, beforeCardId: string | null) {
    if (dragging) onMoveCard(dragging.cardId, toListId, beforeCardId);
    setDragging(null);
    setDropTarget(null);
  }

  const canEditCard = (card: Card) => card.created_by === myUserId || canManage;
  const canEditList = (list: BoardList) => list.created_by === myUserId || canManage;

  return (
    <>
      <div className="board-viewbar">
        <nav className="view-tabs" aria-label="Board views">
          <button
            type="button"
            className={`view-tab${view === "board" ? " is-active" : ""}`}
            onClick={() => setView("board")}
          >
            Board
          </button>
          <button
            type="button"
            className={`view-tab${view === "list" ? " is-active" : ""}`}
            onClick={() => setView("list")}
          >
            List
          </button>
        </nav>
      </div>

      <main className="board-canvas">
        {view === "board" ? (
          <div className="lists" id="boardLists">
            {lists.map((list) => {
              const listCards = cardsByList[list.id] ?? [];
              const color = /^#[0-9A-Fa-f]{6}$/.test(list.color) ? list.color : "#ffffff";
              return (
                <section
                  key={list.id}
                  className="list"
                  id={`list-${list.id}`}
                  data-list-id={list.id}
                  style={{ ["--list-color" as string]: color }}
                >
                  <header className="list-head">
                    <h2 className="list-title">{list.title}</h2>
                    <span className="list-count" title={`${listCards.length} card${listCards.length === 1 ? "" : "s"}`}>
                      {listCards.length}
                    </span>
                    {canEditList(list) && (
                      <div className="list-tools">
                        <button
                          type="button"
                          className="icon-btn"
                          data-list-action="rename"
                          title="Rename list"
                          onClick={() => onRenameList(list)}
                        >
                          &#9998;
                        </button>
                        {listCards.length === 0 && (
                          <button
                            type="button"
                            className="icon-btn"
                            data-list-action="delete"
                            title="Delete list"
                            onClick={() => onDeleteList(list)}
                          >
                            &#10005;
                          </button>
                        )}
                      </div>
                    )}
                  </header>

                  <div
                    className={`list-cards${dropTarget === `${list.id}:end` ? " drop-hover" : ""}`}
                    data-list-id={list.id}
                    onDragOver={(e) => {
                      if (!dragging) return;
                      e.preventDefault();
                      setDropTarget(`${list.id}:end`);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(list.id, null);
                    }}
                  >
                    {listCards.map((card) => {
                      const editable = canEditCard(card);
                      const hasMeta =
                        card.priority !== "none" ||
                        Boolean(card.due_date) ||
                        Boolean(card.link_url) ||
                        card.card_assignees.length > 0 ||
                        card.card_attachments.length > 0;
                      return (
                        <article
                          key={card.id}
                          className={`card${editable ? "" : " card-readonly"}`}
                          draggable={editable}
                          data-card-id={card.id}
                          data-priority={card.priority}
                          style={{ opacity: dragging?.cardId === card.id ? 0.45 : undefined }}
                          onDragStart={(e) => {
                            if (!editable) {
                              e.preventDefault();
                              return;
                            }
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", card.id);
                            setDragging({ cardId: card.id, fromListId: card.list_id });
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setDropTarget(null);
                          }}
                          onDragOver={(e) => {
                            if (!dragging) return;
                            e.preventDefault();
                            e.stopPropagation();
                            setDropTarget(`${card.list_id}:${card.id}`);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDrop(card.list_id, card.id);
                          }}
                          onClick={() => onCardClick(card.id)}
                        >
                          <div className="card-title">{card.title}</div>
                          {hasMeta && (
                            <div className="card-meta">
                              {card.priority !== "none" && (
                                <span className={`badge priority-${card.priority}`}>
                                  {card.priority.charAt(0).toUpperCase() + card.priority.slice(1)}
                                </span>
                              )}
                              {card.card_assignees.map((assignee) => (
                                <span key={assignee.user_id} className="badge assignee">
                                  <PresenceDot
                                    userId={assignee.user_id}
                                    lastSeen={assignee.profiles.last_seen}
                                  />
                                  @{assignee.profiles.username}
                                </span>
                              ))}
                              {card.due_date && (
                                <span className="badge due">{formatDue(card.due_date, card.due_time)}</span>
                              )}
                              {card.link_url && (
                                <a
                                  className="badge link-badge"
                                  href={card.link_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={card.link_url}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Link
                                </a>
                              )}
                              {card.card_attachments.length > 0 && (
                                <span className="badge attachment-count">
                                  {card.card_attachments.length} file
                                  {card.card_attachments.length === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>

                  <form
                    className="add-card-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget.elements.namedItem("title") as HTMLInputElement | null;
                      const title = input?.value.trim() ?? "";
                      if (title !== "") {
                        onAddCard(list.id, title);
                        if (input) input.value = "";
                      }
                    }}
                  >
                    <input type="text" name="title" maxLength={200} placeholder="Add a card" autoComplete="off" required />
                    <button type="submit" className="btn btn-small">
                      Add
                    </button>
                  </form>
                </section>
              );
            })}

            <form
              className="add-list-form"
              id="addListForm"
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem("title") as HTMLInputElement | null;
                const title = input?.value.trim() ?? "";
                if (title !== "") {
                  onAddList(title);
                  if (input) input.value = "";
                }
              }}
            >
              <input type="text" name="title" maxLength={100} placeholder="List name" autoComplete="off" required />
              <button type="submit" className="btn btn-light">
                + Add list
              </button>
            </form>
          </div>
        ) : (
          <div className="list-view" id="listView">
            {lists.map((list) => {
              const listCards = cardsByList[list.id] ?? [];
              return (
                <section key={list.id} className="task-group">
                  <header className="task-group-head">
                    <span className="sidebar-dot" style={{ ["--dot" as string]: list.color }} />
                    <span className="task-group-name">{list.title}</span>
                    <span className="task-group-count">{listCards.length}</span>
                  </header>
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Assignee</th>
                        <th>Priority</th>
                        <th>Due date</th>
                        <th>Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listCards.length === 0 && (
                        <tr className="task-empty">
                          <td colSpan={5}>No tasks in this list yet.</td>
                        </tr>
                      )}
                      {listCards.map((card) => (
                        <tr
                          key={card.id}
                          className="task-row"
                          tabIndex={0}
                          onClick={() => onCardClick(card.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") onCardClick(card.id);
                          }}
                        >
                          <td className="task-title">{card.title}</td>
                          <td className="task-assignees">
                            {card.card_assignees.length > 0 ? (
                              card.card_assignees.map((assignee) => (
                                <span key={assignee.user_id} className="badge assignee">
                                  <PresenceDot
                                    userId={assignee.user_id}
                                    lastSeen={assignee.profiles.last_seen}
                                  />
                                  @{assignee.profiles.username}
                                </span>
                              ))
                            ) : (
                              "\u2014"
                            )}
                          </td>
                          <td>
                            {card.priority !== "none" ? (
                              <span className={`badge priority-${card.priority}`}>
                                {card.priority.charAt(0).toUpperCase() + card.priority.slice(1)}
                              </span>
                            ) : (
                              "\u2014"
                            )}
                          </td>
                          <td className="task-due">
                            {card.due_date ? formatDue(card.due_date, card.due_time) : "\u2014"}
                          </td>
                          <td className="task-link-cell">
                            {card.link_url ? (
                              <a
                                className="task-link"
                                href={card.link_url}
                                target="_blank"
                                rel="noreferrer"
                                title={card.link_url}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {card.link_url}
                              </a>
                            ) : (
                              "\u2014"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
