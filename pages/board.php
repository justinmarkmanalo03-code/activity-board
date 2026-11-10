<?php

require_once __DIR__ . '/../app/functions.php';

$user = require_login();
$boardId = (int) ($_GET['id'] ?? 0);
$board = board_for_user($boardId, (int) $user['id']);

if (!$board) {
    http_response_code(404);
    exit('Board not found.');
}

$isOwner = (bool) $board['is_owner'];
$canManage = board_can_manage($board);

$lists = [];
try {
    $stmt = db()->prepare('SELECT id, title, color, position FROM lists WHERE board_id = ? ORDER BY position ASC, id ASC');
    $stmt->execute([$boardId]);
    $lists = $stmt->fetchAll();
} catch (Throwable $e) {
    try {
        $stmt = db()->prepare('SELECT id, title, "#ffffff" AS color, position FROM lists WHERE board_id = ? ORDER BY position ASC, id ASC');
        $stmt->execute([$boardId]);
        $lists = $stmt->fetchAll();
    } catch (Throwable $e2) {
        $lists = [];
    }
}

$cards = [];
try {
    $stmt = db()->prepare(
        'SELECT c.id, c.list_id, c.title, c.description, c.created_by,
                c.due_date, c.due_time, c.priority, c.position,
                creator.username AS creator_name
           FROM cards c
           JOIN lists l ON l.id = c.list_id
           LEFT JOIN users creator ON creator.id = c.created_by
          WHERE l.board_id = ?
          ORDER BY c.position ASC, c.id ASC'
    );
    $stmt->execute([$boardId]);
    $cards = $stmt->fetchAll();
} catch (Throwable $e) {
    try {
        $stmt = db()->prepare(
            'SELECT c.id, c.list_id, c.title, c.description, c.created_by,
                    c.due_date, NULL AS due_time, "none" AS priority, c.position,
                    creator.username AS creator_name
               FROM cards c
               JOIN lists l ON l.id = c.list_id
               LEFT JOIN users creator ON creator.id = c.created_by
              WHERE l.board_id = ?
              ORDER BY c.position ASC, c.id ASC'
        );
        $stmt->execute([$boardId]);
        $cards = $stmt->fetchAll();
    } catch (Throwable $e2) {
        $cards = [];
    }
}

$assigneesByCard = [];
try {
    $stmt = db()->prepare(
        'SELECT ca.card_id, u.id, u.username, u.avatar, u.last_seen
           FROM card_assignees ca
           JOIN users u ON u.id = ca.user_id
           JOIN cards c ON c.id = ca.card_id
           JOIN lists l ON l.id = c.list_id
          WHERE l.board_id = ?
          ORDER BY u.username ASC'
    );
    $stmt->execute([$boardId]);

    foreach ($stmt->fetchAll() as $row) {
        $assigneesByCard[(int) $row['card_id']][] = [
            'id' => (int) $row['id'],
            'username' => $row['username'],
            'avatar' => $row['avatar'] ?? null,
            'online' => is_user_online($row['last_seen'] ?? null),
        ];
    }
} catch (Throwable $e) {
    $assigneesByCard = [];
}

$attachmentsByCard = [];
try {
    $stmt = db()->prepare(
        'SELECT a.id, a.card_id, a.uploaded_by, a.original_name, a.mime_type,
                a.size_bytes, a.created_at, u.username AS uploader_name
           FROM card_attachments a
           JOIN cards c ON c.id = a.card_id
           JOIN lists l ON l.id = c.list_id
           LEFT JOIN users u ON u.id = a.uploaded_by
          WHERE l.board_id = ?
          ORDER BY a.created_at ASC, a.id ASC'
    );
    $stmt->execute([$boardId]);

    foreach ($stmt->fetchAll() as $row) {
        $attachmentsByCard[(int) $row['card_id']][] = [
            'id' => (int) $row['id'],
            'card_id' => (int) $row['card_id'],
            'uploaded_by' => $row['uploaded_by'] !== null ? (int) $row['uploaded_by'] : null,
            'uploader_name' => $row['uploader_name'] ?? null,
            'name' => $row['original_name'],
            'mime_type' => $row['mime_type'],
            'size_bytes' => (int) $row['size_bytes'],
            'size_label' => format_bytes((int) $row['size_bytes']),
            'url' => app_url('api/attachment.php?id=' . (int) $row['id']),
            'created_at' => $row['created_at'],
        ];
    }
} catch (Throwable $e) {
    $attachmentsByCard = [];
}

$cardsByList = [];
$cardsById = [];

foreach ($cards as $card) {
    $listId = (int) $card['list_id'];
    $cardAssignees = $assigneesByCard[(int) $card['id']] ?? [];
    $cardAttachments = $attachmentsByCard[(int) $card['id']] ?? [];
    $card['assignees'] = $cardAssignees;
    $card['attachments'] = $cardAttachments;
    $cardsByList[$listId][] = $card;
    $cardsById[(int) $card['id']] = [
        'id' => (int) $card['id'],
        'list_id' => $listId,
        'title' => $card['title'],
        'description' => (string) ($card['description'] ?? ''),
        'created_by' => $card['created_by'] !== null ? (int) $card['created_by'] : null,
        'creator_name' => $card['creator_name'],
        'assignees' => $cardAssignees,
        'attachments' => $cardAttachments,
        'due_date' => $card['due_date'],
        'due_time' => $card['due_time'],
        'priority' => $card['priority'],
        'tags' => [],
        'checklist' => [],
        'comments' => [],
    ];
}

$members = [];
try {
    $stmt = db()->prepare(
        "SELECT u.id, u.username, u.avatar, u.last_seen, m.role
           FROM board_members m
           JOIN users u ON u.id = m.user_id
          WHERE m.board_id = ?
          ORDER BY (m.role = 'owner') DESC, u.username ASC"
    );
    $stmt->execute([$boardId]);
    $members = $stmt->fetchAll();
} catch (Throwable $e) {
    try {
        $stmt = db()->prepare(
            "SELECT u.id, u.username, NULL AS avatar, NULL AS last_seen, m.role
               FROM board_members m
               JOIN users u ON u.id = m.user_id
              WHERE m.board_id = ?
              ORDER BY (m.role = 'owner') DESC, u.username ASC"
        );
        $stmt->execute([$boardId]);
        $members = $stmt->fetchAll();
    } catch (Throwable $e2) {
        $members = [[
            'id' => (int) $user['id'],
            'username' => $user['username'],
            'avatar' => $user['avatar'] ?? null,
            'last_seen' => $user['last_seen'] ?? null,
            'role' => $isOwner ? 'owner' : 'member',
        ]];
    }
}

foreach ($members as $index => $member) {
    $members[$index]['online'] = is_user_online($member['last_seen'] ?? null);
}

$stmt = db()->prepare(
    'SELECT b.id, b.title
       FROM boards b
       JOIN board_members m ON m.board_id = b.id AND m.user_id = ?
      ORDER BY b.created_at DESC, b.id DESC'
);
$stmt->execute([(int) $user['id']]);
$navBoards = $stmt->fetchAll();

$sidebarUser = $user;
$sidebarBoards = $navBoards;
$sidebarLists = $lists;
$sidebarShowLists = true;
$sidebarBoardId = $boardId;
$sidebarActive = 'board';

$boardJson = json_encode([
    'id' => $boardId,
    'csrf' => csrf_token(),
    'user_id' => (int) $user['id'],
    'current_username' => $user['username'],
    'current_avatar' => $user['avatar'] ?? null,
    'is_owner' => $isOwner,
    'can_manage' => $canManage,
    'role' => board_role($board),
    'presence_ping' => (int) PRESENCE_PING_SECONDS,
    'attachment_max_bytes' => (int) ATTACHMENT_MAX_BYTES,
    'api_url' => app_url('api/index.php'),
    'dashboard_url' => app_url('pages/dashboard.php'),
    'cards' => $cardsById,
    'members' => array_map(static function (array $member): array {
        return [
            'id' => (int) $member['id'],
            'username' => $member['username'],
            'avatar' => $member['avatar'],
            'online' => (bool) $member['online'],
            'role' => $member['role'],
        ];
    }, $members),
], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_INVALID_UTF8_SUBSTITUTE);
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="<?= e(asset_url('assets/favicon.svg')) ?>" type="image/svg+xml">
    <link rel="shortcut icon" href="<?= e(asset_url('assets/favicon.svg')) ?>" type="image/svg+xml">
    <title><?= e($board['title']) ?> - Activity Board</title>
    <link rel="stylesheet" href="<?= e(asset_url('assets/style.css')) ?>">
</head>
<body class="board-body">
    <div class="bg-decor" aria-hidden="true"><span></span><span></span><span></span></div>

    <div class="app-shell" id="appShell">
        <?php require __DIR__ . '/../includes/sidebar.php'; ?>

        <div class="app-main">
            <header class="board-topbar">
                <button type="button" class="sidebar-toggle" id="sidebarToggle" title="Toggle sidebar" aria-label="Toggle sidebar">&#9776;</button>
                <h1 id="boardTitle"><?= e($board['title']) ?></h1>
        <div class="board-actions">
            <div class="active-member-avatars" id="activeMemberAvatars" aria-label="Online board members">
                <?php foreach ($members as $member): ?>
                    <?php if ((int) $member['id'] !== (int) $user['id']): ?>
                        <span class="active-member" data-active-user="<?= (int) $member['id'] ?>" data-active-name="@<?= e($member['username']) ?>" title="@<?= e($member['username']) ?> is online" <?= !(bool) $member['online'] ? 'hidden' : '' ?>>
                            <span class="avatar-wrap">
                                <?= user_avatar($member['username'], $member['avatar'], 'avatar-sm') ?>
                                <?= presence_dot((int) $member['id'], true) ?>
                            </span>
                        </span>
                    <?php endif; ?>
                <?php endforeach; ?>
            </div>
            <span class="members-chip"><?= count($members) ?> member<?= count($members) === 1 ? '' : 's' ?></span>
            <?php if ($canManage): ?>
                <button type="button" class="btn btn-ghost btn-small" id="shareBtn">Share</button>
                <button type="button" class="btn btn-ghost btn-small" id="renameBoardBtn">Rename</button>
            <?php endif; ?>
            <?php if ($isOwner): ?>
                <button type="button" class="btn btn-danger-ghost btn-small" id="deleteBoardBtn">Delete</button>
            <?php endif; ?>
            </div>
            </header>

            <div class="board-viewbar">
                <nav class="view-tabs" aria-label="Board views">
                    <button type="button" class="view-tab is-active" data-view="board">Board</button>
                    <button type="button" class="view-tab" data-view="list">List</button>
                </nav>
            </div>

    <main class="board-canvas">
        <div class="lists" id="boardLists">
            <?php foreach ($lists as $list): ?>
                <?php
                $listId = (int) $list['id'];
                $listCards = $cardsByList[$listId] ?? [];
                $listColor = preg_match('/^#[0-9A-Fa-f]{6}$/', (string) $list['color']) ? $list['color'] : '#ffffff';
                ?>
                <section class="list" id="list-<?= $listId ?>" data-list-id="<?= $listId ?>" data-list-color="<?= e($listColor) ?>" style="--list-color: <?= e($listColor) ?>">
                    <header class="list-head">
                        <h2 class="list-title"><?= e($list['title']) ?></h2>
                        <div class="list-tools">
                            <button type="button" class="icon-btn" data-list-action="rename" title="Rename list">&#9998;</button>
                            <button type="button" class="icon-btn" data-list-action="delete" title="Delete list" <?= $listCards ? 'hidden' : '' ?>>&#10005;</button>
                        </div>
                    </header>

                    <div class="list-cards" data-list-id="<?= $listId ?>">
                        <?php foreach ($listCards as $card): ?>
                            <?php $hasMeta = $card['priority'] !== 'none' || !empty($card['due_date']) || !empty($card['assignees']) || !empty($card['attachments']); ?>
                            <article class="card" draggable="true" data-card-id="<?= (int) $card['id'] ?>" data-priority="<?= e($card['priority']) ?>">
                                <div class="card-title"><?= e($card['title']) ?></div>
                                <?php if ($hasMeta): ?>
                                    <div class="card-meta">
                                        <?php if ($card['priority'] !== 'none'): ?>
                                            <span class="badge priority-<?= e($card['priority']) ?>"><?= e(ucfirst($card['priority'])) ?></span>
                                        <?php endif; ?>
                                        <?php foreach ($card['assignees'] as $assignee): ?>
                                            <span class="badge assignee">
                                                <?= presence_dot((int) $assignee['id'], (bool) $assignee['online']) ?>
                                                @<?= e($assignee['username']) ?>
                                            </span>
                                        <?php endforeach; ?>
                                        <?php if (!empty($card['due_date'])): ?>
                                            <span class="badge due"><?= e(format_due($card['due_date'], $card['due_time'] ?? null)) ?></span>
                                        <?php endif; ?>
                                        <?php if (!empty($card['attachments'])): ?>
                                            <span class="badge attachment-count"><?= count($card['attachments']) ?> file<?= count($card['attachments']) === 1 ? '' : 's' ?></span>
                                        <?php endif; ?>
                                    </div>
                                <?php endif; ?>
                            </article>
                        <?php endforeach; ?>
                    </div>

                    <form class="add-card-form">
                        <input type="text" name="title" maxlength="200" placeholder="Add a card" autocomplete="off" required>
                        <button type="submit" class="btn btn-small">Add</button>
                    </form>
                </section>
            <?php endforeach; ?>

            <form class="add-list-form" id="addListForm">
                <input type="text" name="title" maxlength="100" placeholder="List name" autocomplete="off" required>
                <button type="submit" class="btn btn-light">+ Add list</button>
            </form>
        </div>

        <div class="list-view" id="listView" hidden></div>
    </main>
        </div>
    </div>

    <div class="modal card-detail-modal" id="cardModal" hidden>
        <div class="modal-card card-detail-card">
            <div class="card-detail-topbar">
                <div class="card-type-chip">
                    <span class="card-type-dot"></span>
                    <span id="cardStatusBadge">Task</span>
                </div>
                <div class="card-topbar-actions">
                    <button type="button" class="icon-btn btn-danger-ghost" id="cardDelete" title="Delete task">&#128465;</button>
                    <button type="button" class="icon-btn" data-close title="Close">&#10005;</button>
                </div>
            </div>

            <form id="cardForm" class="card-detail-form">
                <div class="card-title-wrap">
                    <input type="text" id="cardTitle" class="card-title-input" maxlength="200" placeholder="Task name..." required autocomplete="off">
                </div>

                <div class="card-props-table">
                    <!-- Row 1: Status -->
                    <div class="card-prop-row">
                        <div class="card-prop-label">
                            <span class="prop-icon">&#9678;</span>
                            <span class="prop-text">Status</span>
                        </div>
                        <div class="card-prop-control">
                            <span class="status-pill-badge" id="cardStatusPill">To Do</span>
                        </div>
                    </div>

                    <!-- Row 2: Assignees -->
                    <div class="card-prop-row">
                        <div class="card-prop-label">
                            <span class="prop-icon">&#128100;</span>
                            <span class="prop-text">Assignees</span>
                        </div>
                        <div class="card-prop-control">
                            <div class="assignees-trigger" id="assigneesTrigger" tabindex="0" role="button" title="Assign members">
                                <div class="assignees-display" id="assigneesDisplay">
                                    <span class="prop-empty">Empty</span>
                                </div>
                            </div>
                            <div class="assign-popover" id="assignPopover" hidden>
                                <div class="assign-popover-title">Assign to members</div>
                                <div class="assign-options" id="cardAssigned">
                                    <?php foreach ($members as $member): ?>
                                        <label class="assign-chip">
                                            <input type="checkbox" value="<?= (int) $member['id'] ?>">
                                            <span class="assign-chip-body">
                                                <?= user_avatar($member['username'], $member['avatar'] ?? null, 'avatar-xs') ?>
                                                <span class="assign-name">@<?= e($member['username']) ?><?= $member['role'] === 'owner' ? ' (owner)' : '' ?></span>
                                            </span>
                                        </label>
                                    <?php endforeach; ?>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Row 3: Dates -->
                    <div class="card-prop-row">
                        <div class="card-prop-label">
                            <span class="prop-icon">&#128197;</span>
                            <span class="prop-text">Dates</span>
                        </div>
                        <div class="card-prop-control">
                            <div class="dates-trigger" id="datesTrigger" tabindex="0" role="button" title="Set due date and time">
                                <span class="dates-display" id="datesDisplay">
                                    <span class="prop-empty">Start &rarr; Due</span>
                                </span>
                            </div>
                            <div class="dates-popover" id="datesPopover" hidden>
                                <div class="dates-popover-body">
                                    <label class="date-pick-label">
                                        <span>Due date</span>
                                        <input type="date" id="cardDue">
                                    </label>
                                    <label class="date-pick-label">
                                        <span>Due time</span>
                                        <input type="time" id="cardDueTime">
                                    </label>
                                </div>
                                <button type="button" class="btn btn-ghost btn-small" id="clearDateBtn" style="margin-top:8px;width:100%;">Clear date</button>
                            </div>
                        </div>
                    </div>

                    <!-- Row 4: Priority -->
                    <div class="card-prop-row">
                        <div class="card-prop-label">
                            <span class="prop-icon">&#9873;</span>
                            <span class="prop-text">Priority</span>
                        </div>
                        <div class="card-prop-control">
                            <div class="priority-select-wrap">
                                <select id="cardPriority" class="priority-select-pill">
                                    <option value="none">Empty</option>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Row 5: Attachments -->
                    <div class="card-prop-row">
                        <div class="card-prop-label">
                            <span class="prop-icon">&#128206;</span>
                            <span class="prop-text">Attachments</span>
                        </div>
                        <div class="card-prop-control">
                            <label class="attachment-pick-minimal" title="Upload files">
                                <input type="file" id="cardAttachmentInput" multiple hidden>
                                <span class="prop-add-btn">+ Add files</span>
                            </label>
                            <p class="attachment-status muted small" id="cardAttachmentStatus" hidden></p>
                        </div>
                    </div>

                    <!-- Row 6: Tags -->
                    <div class="card-prop-row">
                        <div class="card-prop-label">
                            <span class="prop-icon">&#127917;</span>
                            <span class="prop-text">Tags</span>
                        </div>
                        <div class="card-prop-control">
                            <div class="tag-row" id="tagRow">
                                <div class="tag-add-form">
                                    <input type="text" id="tagInput" maxlength="20" placeholder="Add tag (Enter)">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <ul class="attachment-list card-attachments-minimal" id="cardAttachments"></ul>

                <div class="card-detail-divider"></div>

                <div class="card-desc-wrap">
                    <textarea id="cardDesc" class="card-desc-input" rows="3" maxlength="5000" placeholder="Add description, notes, or details..."></textarea>
                </div>

                <!-- Checklist -->
                <div class="checklist-section" id="checklistSection">
                    <div class="checklist-head">
                        <span class="checklist-title">Checklist</span>
                        <span class="checklist-progress" id="checklistProgress">0 / 0</span>
                    </div>
                    <div class="checklist-bar"><span id="checklistBar" style="width:0%"></span></div>
                    <div class="checklist-items" id="checklistItems"></div>
                    <div class="checklist-add">
                        <input type="text" id="checklistInput" maxlength="120" placeholder="Add a checklist item">
                        <button type="button" class="btn btn-primary btn-small" id="checklistAdd">Add</button>
                    </div>
                </div>

                <!-- Activity / comments -->
                <div class="activity-section" id="activitySection">
                    <div class="activity-title">Activity</div>
                    <div class="activity-list" id="activityList">
                        <span class="activity-empty">No activity yet.</span>
                    </div>
                    <div class="comment-form">
                        <input type="text" id="commentInput" maxlength="500" placeholder="Write a comment...">
                        <button type="button" class="btn btn-primary btn-small" id="commentAdd">Comment</button>
                    </div>
                </div>

                <div class="card-detail-footer">
                    <span class="muted small card-creator" id="cardCreator"></span>
                    <div class="card-detail-actions">
                        <button type="button" class="btn btn-ghost btn-small" data-close>Cancel</button>
                        <button type="submit" class="btn btn-primary btn-small">Save</button>
                    </div>
                </div>
            </form>
        </div>
    </div>

    <?php if ($canManage): ?>
        <div class="modal" id="shareModal" hidden>
            <div class="modal-card">
                <header class="modal-head">
                    <h2>Share board</h2>
                    <button type="button" class="icon-btn" data-close>&#10005;</button>
                </header>

                <form id="shareForm" class="inline-form">
                    <input type="text" id="shareUsername" maxlength="30" placeholder="Username" autocomplete="off" required>
                    <button type="submit" class="btn btn-primary">Add</button>
                </form>

                <p class="muted small">
                    <?php if ($isOwner): ?>
                        Members can edit lists and cards. Give someone manager power if you trust them to add people, rename the board, and edit cards. Only you can delete the board or change who is a manager.
                    <?php else: ?>
                        You are a manager of this board. You can add members, rename the board, and edit lists and cards.
                    <?php endif; ?>
                </p>

                <ul class="member-list" id="memberList">
                    <?php foreach ($members as $member): ?>
                        <?php
                        $memberId = (int) $member['id'];
                        $memberRole = $member['role'];
                        $isMemberOwner = $memberRole === 'owner';
                        $isMemberManager = $memberRole === 'manager';
                        $canRemoveMember = !$isMemberOwner && ($isOwner || (!$isMemberManager && $canManage));
                        ?>
                        <li data-user-id="<?= $memberId ?>" data-role="<?= e($memberRole) ?>">
                            <span class="member-identity">
                                <span class="avatar-wrap">
                                    <?= user_avatar($member['username'], $member['avatar'], 'avatar-sm') ?>
                                    <?= presence_dot($memberId, (bool) $member['online']) ?>
                                </span>
                                <span class="member-name">@<?= e($member['username']) ?></span>
                            </span>
                            <span class="role-badge role-<?= e($memberRole) ?>"><?= e(role_label($memberRole)) ?></span>
                            <?php if ($isOwner && !$isMemberOwner): ?>
                                <button
                                    type="button"
                                    class="role-toggle<?= $isMemberManager ? ' is-active' : '' ?>"
                                    data-member-role="<?= $isMemberManager ? 'member' : 'manager' ?>"
                                    data-user-id="<?= $memberId ?>"
                                    title="<?= $isMemberManager ? 'Revoke manager power' : 'Give manager power' ?>"
                                ><?= $isMemberManager ? 'Revoke power' : 'Give power' ?></button>
                            <?php endif; ?>
                            <?php if ($canRemoveMember): ?>
                                <button type="button" class="icon-btn" data-remove-member="<?= $memberId ?>" title="Remove member">&#10005;</button>
                            <?php endif; ?>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </div>
        </div>
    <?php endif; ?>

    <div class="confirm-overlay" id="confirmOverlay" hidden>
        <div class="modal-card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle">
            <header class="modal-head">
                <h2 id="confirmTitle">Are you sure?</h2>
                <button type="button" class="icon-btn" id="confirmClose" aria-label="Cancel">&#10005;</button>
            </header>
            <p class="muted confirm-message" id="confirmMessage"></p>
            <div class="modal-actions">
                <div class="spacer"></div>
                <button type="button" class="btn btn-small" id="confirmCancel">Cancel</button>
                <button type="button" class="btn btn-danger-ghost btn-small" id="confirmOk">Delete</button>
            </div>
        </div>
    </div>

    <div class="confirm-overlay" id="promptOverlay" hidden>
        <div class="modal-card prompt-card" role="dialog" aria-modal="true" aria-labelledby="promptTitle">
            <header class="modal-head">
                <h2 id="promptTitle">Rename</h2>
                <button type="button" class="icon-btn" id="promptClose" aria-label="Cancel">&#10005;</button>
            </header>
            <form id="promptForm" class="stack prompt-form">
                <label>
                    <span id="promptLabel">Name</span>
                    <input type="text" id="promptInput" maxlength="200" autocomplete="off" required>
                </label>
                <div class="color-field" id="promptColorField" hidden>
                    <span class="field-label">List color</span>
                    <div class="color-palette" id="promptColorPalette" role="group" aria-label="List color choices"></div>
                    <label class="color-custom">
                        <input type="color" id="promptColor" value="#ffffff">
                        <span>Custom color</span>
                    </label>
                </div>
                <div class="modal-actions">
                    <div class="spacer"></div>
                    <button type="button" class="btn btn-small" id="promptCancel">Cancel</button>
                    <button type="submit" class="btn btn-primary btn-small" id="promptOk">Save</button>
                </div>
            </form>
        </div>
    </div>

    <div class="toast" id="toast" hidden></div>

    <script>window.BOARD = <?= $boardJson ?>;</script>
    <script src="<?= e(asset_url('assets/sidebar.js')) ?>"></script>
    <script src="<?= e(asset_url('assets/board.js')) ?>"></script>
</body>
</html>
