<?php

require_once __DIR__ . '/../app/functions.php';

$user = require_login();
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $title = trim((string) ($_POST['title'] ?? ''));

    if (!verify_csrf($_POST['csrf'] ?? null)) {
        $error = 'Your session expired. Please try again.';
    } elseif ($title === '' || text_length($title) > 100) {
        $error = 'Board title must be between 1 and 100 characters.';
    } else {
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $stmt = $pdo->prepare('INSERT INTO boards (owner_id, title) VALUES (?, ?)');
            $stmt->execute([(int) $user['id'], $title]);
            $boardId = (int) $pdo->lastInsertId();

            $stmt = $pdo->prepare("INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, 'owner')");
            $stmt->execute([$boardId, (int) $user['id']]);

            $pdo->commit();
            redirect(app_url('pages/board.php?id=' . $boardId));
        } catch (Throwable $e) {
            $pdo->rollBack();
            error_log('Create board failed: ' . $e->getMessage());
            $error = 'Could not create the board. Please try again.';
        }
    }
}

$stmt = db()->prepare(
    'SELECT b.id, b.title, b.created_at, (b.owner_id = ?) AS is_owner, m.role,
            (SELECT COUNT(*) FROM board_members bm WHERE bm.board_id = b.id) AS member_count
       FROM boards b
       JOIN board_members m ON m.board_id = b.id AND m.user_id = ?
      ORDER BY b.created_at DESC, b.id DESC'
);
$stmt->execute([(int) $user['id'], (int) $user['id']]);
$boards = $stmt->fetchAll();

$sidebarUser = $user;
$sidebarBoards = $boards;
$sidebarLists = [];
$sidebarShowLists = false;
$sidebarBoardId = 0;
$sidebarActive = 'dashboard';
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="<?= e(asset_url('assets/favicon.svg')) ?>" type="image/svg+xml">
    <link rel="shortcut icon" href="<?= e(asset_url('assets/favicon.svg')) ?>" type="image/svg+xml">
    <title>Your boards - Activity Board</title>
    <link rel="stylesheet" href="<?= e(asset_url('assets/style.css')) ?>">
</head>
<body>
    <div class="bg-decor" aria-hidden="true"><span></span><span></span><span></span></div>

    <div class="app-shell" id="appShell">
        <?php require __DIR__ . '/../includes/sidebar.php'; ?>

        <div class="app-main">
            <header class="topbar">
                <div class="topbar-left">
                    <button type="button" class="sidebar-toggle" id="sidebarToggle" title="Toggle sidebar" aria-label="Toggle sidebar">&#9776;</button>
                    <div class="brand">Activity Board</div>
                </div>
            </header>

    <main class="page">
        <div class="page-head">
            <div>
                <p class="eyebrow">Your workspace</p>
                <h1>Boards</h1>
                <p class="muted">Organize tasks into lists and drag cards as work moves forward.</p>
            </div>
        </div>

        <?php if ($error !== ''): ?>
            <div class="alert"><?= e($error) ?></div>
        <?php endif; ?>

        <form method="post" class="create-board">
            <?= csrf_field() ?>
            <input type="text" name="title" maxlength="100" placeholder="New board title" required>
            <button type="submit" class="btn btn-primary">Create board</button>
        </form>

        <?php if (!$boards): ?>
            <div class="empty">
                <strong>No boards yet.</strong>
                <p>Create your first board above to get started.</p>
            </div>
        <?php else: ?>
            <div class="board-grid">
                <?php foreach ($boards as $board): ?>
                    <a class="board-tile" href="<?= e(app_url('pages/board.php?id=' . (int) $board['id'])) ?>">
                        <h2><?= e($board['title']) ?></h2>
                        <p>
                            <?php
                            if ((int) $board['is_owner']) {
                                echo 'Owner';
                            } elseif (($board['role'] ?? 'member') === 'manager') {
                                echo 'Manager';
                            } else {
                                echo 'Shared with you';
                            }
                            ?>
                            <?php if ((int) $board['member_count'] > 1): ?>
                                &middot; <?= (int) $board['member_count'] ?> members
                            <?php endif; ?>
                        </p>
                    </a>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </main>
        </div>
    </div>

    <script>window.PRESENCE = { endpoint: '<?= e(app_url('api/index.php')) ?>', csrf: '<?= e(csrf_token()) ?>', interval: <?= (int) PRESENCE_PING_SECONDS ?> };</script>
    <script src="<?= e(asset_url('assets/presence.js')) ?>"></script>
    <script src="<?= e(asset_url('assets/sidebar.js')) ?>"></script>
</body>
</html>
