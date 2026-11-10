<?php

require_once __DIR__ . '/../app/functions.php';

$user = require_admin();
$refreshSeconds = defined('STORAGE_REFRESH_SECONDS') ? max(5, (int) STORAGE_REFRESH_SECONDS) : 30;

$boards = [];
try {
    $stmt = db()->prepare(
        'SELECT b.id, b.title, b.created_at, (b.owner_id = ?) AS is_owner, m.role,
                (SELECT COUNT(*) FROM board_members bm WHERE bm.board_id = b.id) AS member_count
           FROM boards b
           JOIN board_members m ON m.board_id = b.id AND m.user_id = ?
          ORDER BY b.created_at DESC, b.id DESC'
    );
    $stmt->execute([(int) $user['id'], (int) $user['id']]);
    $boards = $stmt->fetchAll();
} catch (Throwable $e) {
    $boards = [];
}

$sidebarUser = $user;
$sidebarBoards = $boards;
$sidebarLists = [];
$sidebarShowLists = false;
$sidebarBoardId = 0;
$sidebarActive = 'admin';
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="<?= e(asset_url('assets/favicon.svg')) ?>" type="image/svg+xml">
    <link rel="shortcut icon" href="<?= e(asset_url('assets/favicon.svg')) ?>" type="image/svg+xml">
    <title>Admin - Storage monitor</title>
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
                <div class="topbar-right">
                    <a class="back-link" href="<?= e(app_url('pages/dashboard.php')) ?>">&larr; Boards</a>
                    <span class="user-chip">@<?= e($user['username']) ?></span>
                </div>
            </header>

            <main class="page admin-page">
                <div class="page-head">
                    <div>
                        <p class="eyebrow">Admin</p>
                        <h1>Storage monitor</h1>
                        <p class="muted">Live estimate of this app's files plus your MySQL database on InfinityFree. Auto-refreshes every <span id="refreshSecs"><?= $refreshSeconds ?></span> seconds.</p>
                    </div>
                    <div class="live-indicator">
                        <span class="live-dot" id="liveDot"></span>
                        <span class="muted small">Updated <span id="updatedAt">loading...</span></span>
                    </div>
                </div>

                <section class="stat-grid">
                    <article class="stat-card">
                        <span class="stat-label">Total used</span>
                        <strong class="stat-value" id="totalUsed">&mdash;</strong>
                        <span class="stat-sub" id="totalSub">files + database</span>
                    </article>
                    <article class="stat-card">
                        <span class="stat-label">App files</span>
                        <strong class="stat-value" id="filesUsed">&mdash;</strong>
                        <span class="stat-sub" id="fileMeta">&mdash;</span>
                    </article>
                    <article class="stat-card">
                        <span class="stat-label">Database</span>
                        <strong class="stat-value" id="dbUsed">&mdash;</strong>
                        <span class="stat-sub" id="dbMeta">&mdash;</span>
                    </article>
                    <article class="stat-card">
                        <span class="stat-label">Storage limit</span>
                        <strong class="stat-value" id="limitUsed">&mdash;</strong>
                        <span class="stat-sub">configured in config.php</span>
                    </article>
                </section>

                <section class="panel">
                    <div class="panel-head">
                        <h2>Quota usage</h2>
                        <span class="status-pill status-unknown" id="statusPill">Loading</span>
                    </div>
                    <div class="usage-bar">
                        <div class="usage-fill status-unknown" id="usageFill"></div>
                    </div>
                    <p class="muted small" id="usageText">Checking storage...</p>
                </section>

                <div class="admin-columns">
                    <section class="panel">
                        <div class="panel-head">
                            <h2>App folder breakdown</h2>
                            <span class="muted small" id="fileCount"></span>
                        </div>
                        <table class="data-table">
                            <thead>
                                <tr><th>File / folder</th><th class="cell-right">Size</th></tr>
                            </thead>
                            <tbody id="fileBreakdown">
                                <tr><td class="empty-cell" colspan="2">Loading...</td></tr>
                            </tbody>
                        </table>
                    </section>

                    <section class="panel">
                        <div class="panel-head">
                            <h2>Database tables</h2>
                            <span class="muted small" id="dbCount"></span>
                        </div>
                        <table class="data-table">
                            <thead>
                                <tr><th>Table name</th><th class="cell-right">Rows (est.)</th><th class="cell-right">Data</th><th class="cell-right">Index</th><th class="cell-right">Total</th></tr>
                            </thead>
                            <tbody id="tableBreakdown">
                                <tr><td class="empty-cell" colspan="5">Loading...</td></tr>
                            </tbody>
                        </table>
                    </section>
                </div>

                <section class="panel">
                    <div class="panel-head">
                        <h2>Top files by disk usage</h2>
                        <span class="muted small">Largest files in this app</span>
                    </div>
                    <table class="data-table">
                        <thead>
                            <tr><th>File path</th><th class="cell-right">Size</th></tr>
                        </thead>
                        <tbody id="largestFiles">
                            <tr><td class="empty-cell" colspan="2">Loading...</td></tr>
                        </tbody>
                    </table>
                </section>

                <section class="panel">
                    <div class="panel-head">
                        <h2>Server filesystem</h2>
                    </div>
                    <p class="muted small disk-note" id="diskText">Checking server disk...</p>
                    <p class="muted small">Note: InfinityFree does not expose an account-quota API. "Server filesystem" is best-effort and may reflect the shared server rather than your account. The quota bar above uses your app files + database versus <code>STORAGE_LIMIT_BYTES</code>.</p>
                </section>
            </main>
        </div>
    </div>

    <script>window.ADMIN_CONFIG = { refreshSeconds: <?= $refreshSeconds ?>, endpoint: '<?= e(app_url('api/admin.php')) ?>' };</script>
    <script>window.PRESENCE = { endpoint: '<?= e(app_url('api/index.php')) ?>', csrf: '<?= e(csrf_token()) ?>', interval: <?= (int) PRESENCE_PING_SECONDS ?> };</script>
    <script src="<?= e(asset_url('assets/admin.js')) ?>"></script>
    <script src="<?= e(asset_url('assets/presence.js')) ?>"></script>
    <script src="<?= e(asset_url('assets/sidebar.js')) ?>"></script>
</body>
</html>
