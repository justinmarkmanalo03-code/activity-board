<?php

require_once __DIR__ . '/../app/functions.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function api_response($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function api_error(string $message, int $status = 400): void
{
    api_response(['ok' => false, 'error' => $message], $status);
}

function parse_assignee_ids($value): array
{
    $raw = is_array($value) ? $value : ($value === null || $value === '' ? [] : [$value]);
    $ids = [];

    foreach ($raw as $candidate) {
        $id = (int) $candidate;

        if ($id > 0 && !in_array($id, $ids, true)) {
            $ids[] = $id;
        }
    }

    return $ids;
}

$user = current_user();

if (!$user) {
    api_error('Your session has expired. Please sign in again.', 401);
}

$userId = (int) $user['id'];

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    api_error('POST required.', 405);
}

$action = (string) ($_POST['action'] ?? '');

// When an upload exceeds post_max_size, PHP silently empties $_POST and $_FILES,
// which would otherwise look like a bogus security token.
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0 && !$_POST && !$_FILES) {
    api_error('That upload is too large for the server. Choose a smaller file.', 413);
}

if (!verify_csrf($_POST['csrf'] ?? null)) {
    api_error('Invalid security token. Refresh the page and try again.', 419);
}

try {
    switch ($action) {
        case 'board.rename': {
            $boardId = (int) ($_POST['board_id'] ?? 0);
            $board = board_for_user($boardId, $userId);

            if (!$board) {
                api_error('Board not found.', 404);
            }
            if (!board_can_manage($board)) {
                api_error('Only the board owner or a manager can rename this board.', 403);
            }

            $title = trim((string) ($_POST['title'] ?? ''));
            if ($title === '' || text_length($title) > 100) {
                api_error('Board title must be 1-100 characters.');
            }

            db()->prepare('UPDATE boards SET title = ? WHERE id = ?')
                ->execute([$title, $boardId]);

            api_response(['ok' => true, 'board' => ['id' => $boardId, 'title' => $title]]);
        }

        case 'board.delete': {
            $boardId = (int) ($_POST['board_id'] ?? 0);
            $board = board_for_user($boardId, $userId);

            if (!$board) {
                api_error('Board not found.', 404);
            }
            if (!(int) $board['is_owner']) {
                api_error('Only the board owner can delete this board.', 403);
            }

            db()->prepare('DELETE FROM boards WHERE id = ?')->execute([$boardId]);
            api_response(['ok' => true]);
        }

        case 'board.share': {
            $boardId = (int) ($_POST['board_id'] ?? 0);
            $board = board_for_user($boardId, $userId);

            if (!$board) {
                api_error('Board not found.', 404);
            }
            if (!board_can_manage($board)) {
                api_error('Only the board owner or a manager can add members.', 403);
            }

            $username = trim((string) ($_POST['username'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9_]{3,30}$/', $username)) {
                api_error('Enter a valid username.');
            }

            $stmt = db()->prepare('SELECT id, username, avatar, last_seen FROM users WHERE username = ? LIMIT 1');
            $stmt->execute([$username]);
            $member = $stmt->fetch();

            if (!$member) {
                api_error('No account with that username exists.', 404);
            }
            if ((int) $member['id'] === (int) $board['owner_id']) {
                api_error('That user already owns this board.', 409);
            }

            $stmt = db()->prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?');
            $stmt->execute([$boardId, (int) $member['id']]);
            if ($stmt->fetchColumn()) {
                api_error('That user already has access to this board.', 409);
            }

            db()->prepare("INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, 'member')")
                ->execute([$boardId, (int) $member['id']]);

            api_response([
                'ok' => true,
                'member' => [
                    'id' => (int) $member['id'],
                    'username' => $member['username'],
                    'avatar' => $member['avatar'],
                    'online' => is_user_online($member['last_seen']),
                    'role' => 'member',
                ],
            ]);
        }

        case 'board.unshare': {
            $boardId = (int) ($_POST['board_id'] ?? 0);
            $board = board_for_user($boardId, $userId);

            if (!$board) {
                api_error('Board not found.', 404);
            }
            if (!board_can_manage($board)) {
                api_error('Only the board owner or a manager can remove members.', 403);
            }

            $memberId = (int) ($_POST['user_id'] ?? 0);
            if ($memberId <= 0) {
                api_error('Invalid member.');
            }
            if ($memberId === (int) $board['owner_id']) {
                api_error('You cannot remove the board owner.', 400);
            }

            $stmt = db()->prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([$boardId, $memberId]);
            $targetRole = $stmt->fetchColumn();

            if ($targetRole === false) {
                api_error('That user is not a member of this board.', 404);
            }
            if ($targetRole === 'manager' && !(int) $board['is_owner']) {
                api_error('Only the board owner can remove a manager.', 403);
            }

            db()->prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?')
                ->execute([$boardId, $memberId]);

            api_response(['ok' => true]);
        }

        case 'board.member_role': {
            $boardId = (int) ($_POST['board_id'] ?? 0);
            $board = board_for_user($boardId, $userId);

            if (!$board) {
                api_error('Board not found.', 404);
            }
            if (!(int) $board['is_owner']) {
                api_error('Only the board owner can give or revoke manager power.', 403);
            }

            $memberId = (int) ($_POST['user_id'] ?? 0);
            $role = (string) ($_POST['role'] ?? '');

            if ($memberId <= 0) {
                api_error('Invalid member.');
            }
            if ($memberId === (int) $board['owner_id']) {
                api_error('You cannot change the owner\'s role.', 400);
            }
            if (!in_array($role, ['manager', 'member'], true)) {
                api_error('Choose a valid role.');
            }

            $stmt = db()->prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([$boardId, $memberId]);

            if (!$stmt->fetchColumn()) {
                api_error('That user is not a member of this board.', 404);
            }

            db()->prepare('UPDATE board_members SET role = ? WHERE board_id = ? AND user_id = ?')
                ->execute([$role, $boardId, $memberId]);

            api_response(['ok' => true, 'role' => $role]);
        }

        case 'list.create': {
            $boardId = (int) ($_POST['board_id'] ?? 0);
            $board = board_for_user($boardId, $userId);

            if (!$board) {
                api_error('Board not found.', 404);
            }

            $title = trim((string) ($_POST['title'] ?? ''));
            if ($title === '' || text_length($title) > 100) {
                api_error('List title must be 1-100 characters.');
            }

            $position = next_position('lists', 'board_id', $boardId);
            $stmt = db()->prepare('INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)');
            $stmt->execute([$boardId, $title, $position]);

            api_response([
                'ok' => true,
                'list' => [
                    'id' => (int) db()->lastInsertId(),
                    'title' => $title,
                    'color' => '#ffffff',
                    'position' => $position,
                ],
            ]);
        }

        case 'list.rename': {
            $listId = (int) ($_POST['list_id'] ?? 0);
            $list = list_for_user($listId, $userId);

            if (!$list) {
                api_error('List not found.', 404);
            }

            $title = trim((string) ($_POST['title'] ?? ''));
            if ($title === '' || text_length($title) > 100) {
                api_error('List title must be 1-100 characters.');
            }

            $color = trim((string) ($_POST['color'] ?? $list['color']));
            if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $color)) {
                api_error('Choose a valid list color.');
            }

            db()->prepare('UPDATE lists SET title = ?, color = ? WHERE id = ?')->execute([$title, $color, $listId]);
            api_response(['ok' => true, 'list' => ['id' => $listId, 'title' => $title, 'color' => $color]]);
        }

        case 'list.delete': {
            $listId = (int) ($_POST['list_id'] ?? 0);
            $list = list_for_user($listId, $userId);

            if (!$list) {
                api_error('List not found.', 404);
            }

            $stmt = db()->prepare('SELECT 1 FROM cards WHERE list_id = ? LIMIT 1');
            $stmt->execute([$listId]);

            if ($stmt->fetchColumn()) {
                api_error('Move or delete the cards before deleting this list.', 409);
            }

            db()->prepare('DELETE FROM lists WHERE id = ?')->execute([$listId]);
            api_response(['ok' => true]);
        }

        case 'presence.ping': {
            db()->prepare('UPDATE users SET last_seen = NOW() WHERE id = ?')->execute([$userId]);

            $boardId = (int) ($_POST['board_id'] ?? 0);

            if ($boardId <= 0) {
                api_response(['ok' => true, 'online' => []]);
            }

            $board = board_for_user($boardId, $userId);

            if (!$board) {
                api_error('Board not found.', 404);
            }

            $presenceTtl = (int) PRESENCE_TTL_SECONDS;
            $stmt = db()->prepare(
                "SELECT u.id
                   FROM users u
                   JOIN board_members m ON m.user_id = u.id
                  WHERE m.board_id = ?
                    AND u.last_seen >= DATE_SUB(NOW(), INTERVAL {$presenceTtl} SECOND)"
            );
            $stmt->execute([$boardId]);

            api_response([
                'ok' => true,
                'online' => array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN)),
            ]);
        }

        case 'card.create': {
            $listId = (int) ($_POST['list_id'] ?? 0);
            $list = list_for_user($listId, $userId);

            if (!$list) {
                api_error('List not found.', 404);
            }

            $title = trim((string) ($_POST['title'] ?? ''));
            if ($title === '' || text_length($title) > 200) {
                api_error('Card title must be 1-200 characters.');
            }

            $assigneeIds = parse_assignee_ids($_POST['assigned_to'] ?? null);

            foreach ($assigneeIds as $assigneeId) {
                if (!board_member_exists((int) $list['board_id'], $assigneeId)) {
                    api_error('You can only assign cards to members of this board.', 400);
                }
            }

            $position = next_position('cards', 'list_id', $listId);
            $stmt = db()->prepare(
                "INSERT INTO cards (list_id, title, description, priority, position, created_by)
                 VALUES (?, ?, NULL, 'none', ?, ?)"
            );
            $stmt->execute([$listId, $title, $position, $userId]);

            $cardId = (int) db()->lastInsertId();
            sync_card_assignees($cardId, $assigneeIds);

            api_response([
                'ok' => true,
                'card' => [
                    'id' => $cardId,
                    'list_id' => $listId,
                    'title' => $title,
                    'description' => '',
                    'created_by' => $userId,
                    'creator_name' => $user['username'],
                    'assignees' => card_assignees($cardId),
                    'due_date' => null,
                    'due_time' => null,
                    'priority' => 'none',
                    'position' => $position,
                    'attachments' => [],
                ],
            ]);
        }

        case 'card.update': {
            $cardId = (int) ($_POST['card_id'] ?? 0);
            $card = card_for_user($cardId, $userId);

            if (!$card) {
                api_error('Card not found.', 404);
            }

            $title = trim((string) ($_POST['title'] ?? ''));
            if ($title === '' || text_length($title) > 200) {
                api_error('Card title must be 1-200 characters.');
            }

            $description = trim((string) ($_POST['description'] ?? ''));
            if (text_length($description) > 5000) {
                api_error('Description must be 5000 characters or fewer.');
            }

            $dueDate = trim((string) ($_POST['due_date'] ?? ''));
            if ($dueDate === '') {
                $dueDate = null;
            } elseif (
                !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dueDate, $parts)
                || !checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])
            ) {
                api_error('Enter a valid due date.');
            }

            $dueTime = trim((string) ($_POST['due_time'] ?? ''));
            if ($dueTime === '') {
                $dueTime = null;
            } elseif (!preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', $dueTime)) {
                api_error('Enter a valid due time.');
            } elseif ($dueDate === null) {
                api_error('Choose a due date before setting a due time.');
            }

            $priority = (string) ($_POST['priority'] ?? 'none');
            if (!in_array($priority, ['none', 'low', 'medium', 'high'], true)) {
                $priority = 'none';
            }

            $assigneeIds = parse_assignee_ids($_POST['assigned_to'] ?? null);

            foreach ($assigneeIds as $assigneeId) {
                if (!board_member_exists((int) $card['board_id'], $assigneeId)) {
                    api_error('You can only assign cards to members of this board.', 400);
                }
            }

            $description = $description === '' ? null : $description;

            db()->prepare(
                'UPDATE cards
                    SET title = ?, description = ?, due_date = ?, due_time = ?, priority = ?
                  WHERE id = ?'
            )->execute([$title, $description, $dueDate, $dueTime, $priority, $cardId]);

            sync_card_assignees($cardId, $assigneeIds);

            api_response([
                'ok' => true,
                'card' => [
                    'id' => $cardId,
                    'list_id' => (int) $card['list_id'],
                    'title' => $title,
                    'description' => (string) $description,
                    'created_by' => $card['created_by'] !== null ? (int) $card['created_by'] : null,
                    'creator_name' => $card['creator_name'] ?? null,
                    'assignees' => card_assignees($cardId),
                    'due_date' => $dueDate,
                    'due_time' => $dueTime,
                    'priority' => $priority,
                    'position' => (int) $card['position'],
                    'attachments' => card_attachments($cardId),
                ],
            ]);
        }

        case 'attachment.upload': {
            $cardId = (int) ($_POST['card_id'] ?? 0);
            $card = card_for_user($cardId, $userId);

            if (!$card) {
                api_error('Card not found.', 404);
            }

            if (empty($_FILES['file'])) {
                api_error('Choose a file to upload.');
            }

            try {
                card_attachment_store($_FILES['file'], $cardId, $userId);
            } catch (RuntimeException $e) {
                api_error($e->getMessage(), 400);
            }

            api_response([
                'ok' => true,
                'attachments' => card_attachments($cardId),
            ]);
        }

        case 'attachment.delete': {
            $attachmentId = (int) ($_POST['attachment_id'] ?? 0);
            $attachment = card_attachment_for_user($attachmentId, $userId);

            if (!$attachment) {
                api_error('Attachment not found.', 404);
            }

            $board = board_for_user((int) $attachment['board_id'], $userId);
            $canManage = $board ? board_can_manage($board) : false;
            $uploaderId = $attachment['uploaded_by'] !== null ? (int) $attachment['uploaded_by'] : null;

            if ($uploaderId !== $userId && !$canManage) {
                api_error('Only the uploader or a board manager can remove this file.', 403);
            }

            card_attachment_delete($attachment);

            api_response([
                'ok' => true,
                'attachments' => card_attachments((int) $attachment['card_id']),
            ]);
        }

        case 'card.delete': {
            $cardId = (int) ($_POST['card_id'] ?? 0);
            $card = card_for_user($cardId, $userId);

            if (!$card) {
                api_error('Card not found.', 404);
            }

            $creatorId = $card['created_by'] !== null ? (int) $card['created_by'] : null;
            $board = board_for_user((int) $card['board_id'], $userId);
            $canManage = $board ? board_can_manage($board) : false;

            if ($creatorId !== $userId && !$canManage) {
                api_error('Only the card creator or a board manager can delete this card.', 403);
            }

            db()->prepare('DELETE FROM cards WHERE id = ?')->execute([$cardId]);
            api_response(['ok' => true]);
        }

        case 'card.move': {
            $cardId = (int) ($_POST['card_id'] ?? 0);
            $toListId = (int) ($_POST['to_list_id'] ?? 0);

            $card = card_for_user($cardId, $userId);
            $target = list_for_user($toListId, $userId);

            if (!$card || !$target) {
                api_error('Card or list not found.', 404);
            }
            if ((int) $card['board_id'] !== (int) $target['board_id']) {
                api_error('You cannot move a card to a different board.', 400);
            }

            $order = $_POST['order'] ?? [];
            if (!is_array($order)) {
                $order = [];
            }

            $orderIds = [];
            foreach ($order as $id) {
                $id = (int) $id;
                if ($id > 0 && !in_array($id, $orderIds, true)) {
                    $orderIds[] = $id;
                }
            }
            if (!in_array($cardId, $orderIds, true)) {
                $orderIds[] = $cardId;
            }

            $pdo = db();
            $pdo->beginTransaction();

            try {
                $pdo->prepare('UPDATE cards SET list_id = ? WHERE id = ?')
                    ->execute([$toListId, $cardId]);

                $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
                $stmt = $pdo->prepare(
                    "SELECT c.id
                       FROM cards c
                       JOIN lists l ON l.id = c.list_id
                      WHERE l.board_id = ? AND c.id IN ($placeholders)"
                );
                $stmt->execute(array_merge([(int) $target['board_id']], $orderIds));
                $validIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

                $update = $pdo->prepare('UPDATE cards SET position = ? WHERE id = ? AND list_id = ?');
                $position = 0;

                foreach ($orderIds as $id) {
                    if (in_array($id, $validIds, true)) {
                        $update->execute([$position, $id, $toListId]);
                        $position++;
                    }
                }

                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }

            api_response(['ok' => true]);
        }

        default:
            api_error('Unknown action.', 404);
    }
} catch (Throwable $e) {
    error_log('API error (' . $action . '): ' . $e->getMessage());
    api_error('Something went wrong. Please try again.', 500);
}
