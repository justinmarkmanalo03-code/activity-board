<?php

if (!isset($sidebarUser) || !is_array($sidebarUser)) {
    http_response_code(404);
    exit;
}

$sidebarBoards = $sidebarBoards ?? [];
$sidebarLists = $sidebarLists ?? [];
$sidebarShowLists = $sidebarShowLists ?? false;
$sidebarBoardId = (int) ($sidebarBoardId ?? 0);
$sidebarActive = $sidebarActive ?? '';
?>
<aside class="app-sidebar" id="appSidebar" aria-label="Workspace navigation">
    <div class="sidebar-head">
        <span class="workspace-badge">AB</span>
        <div class="workspace-meta">
            <strong>Activity Board</strong>
            <span>Workspace</span>
        </div>
        <button type="button" class="sidebar-collapse" id="sidebarCollapse" title="Collapse sidebar" aria-label="Collapse sidebar">&#171;</button>
    </div>

    <nav class="sidebar-nav">
        <a class="sidebar-link<?= $sidebarActive === 'dashboard' ? ' is-active' : '' ?>" href="<?= e(app_url('pages/dashboard.php')) ?>">
            <span class="sidebar-icon">&#8962;</span>
            <span class="sidebar-label">Home</span>
        </a>
        <a class="sidebar-link<?= $sidebarActive === 'profile' ? ' is-active' : '' ?>" href="<?= e(app_url('pages/profile.php')) ?>">
            <span class="sidebar-icon">&#9787;</span>
            <span class="sidebar-label">Profile</span>
        </a>

        <div class="sidebar-section">
            <span class="sidebar-section-title">Spaces</span>
            <?php foreach ($sidebarBoards as $navBoard): ?>
                <?php $navBoardId = (int) $navBoard['id']; ?>
                <a class="sidebar-link<?= $navBoardId === $sidebarBoardId ? ' is-active' : '' ?>" href="<?= e(app_url('pages/board.php?id=' . $navBoardId)) ?>">
                    <span class="sidebar-icon sidebar-icon-square"><?= e(avatar_initial($navBoard['title'])) ?></span>
                    <span class="sidebar-label"><?= e($navBoard['title']) ?></span>
                </a>
            <?php endforeach; ?>
            <?php if (!$sidebarBoards): ?>
                <span class="sidebar-empty">No boards yet</span>
            <?php endif; ?>
        </div>

        <?php if ($sidebarShowLists): ?>
            <div class="sidebar-section">
                <span class="sidebar-section-title">Lists</span>
                <?php foreach ($sidebarLists as $navList): ?>
                    <?php $navColor = preg_match('/^#[0-9A-Fa-f]{6}$/', (string) $navList['color']) ? $navList['color'] : '#ffffff'; ?>
                    <a class="sidebar-link" href="#list-<?= (int) $navList['id'] ?>">
                        <span class="sidebar-dot" style="--dot: <?= e($navColor) ?>"></span>
                        <span class="sidebar-label"><?= e($navList['title']) ?></span>
                    </a>
                <?php endforeach; ?>
                <?php if (!$sidebarLists): ?>
                    <span class="sidebar-empty">No lists yet</span>
                <?php endif; ?>
            </div>
        <?php endif; ?>
    </nav>

    <div class="sidebar-foot">
        <?php if (is_admin($sidebarUser)): ?>
            <a class="sidebar-link<?= $sidebarActive === 'admin' ? ' is-active' : '' ?>" href="<?= e(app_url('pages/admin.php')) ?>">
                <span class="sidebar-icon">&#9881;</span>
                <span class="sidebar-label">Admin</span>
            </a>
        <?php endif; ?>
        <a class="sidebar-user" href="<?= e(app_url('pages/profile.php')) ?>" title="Your profile">
            <?= user_avatar($sidebarUser['username'], $sidebarUser['avatar'] ?? null, 'avatar-xs') ?>
            <span class="sidebar-label">@<?= e($sidebarUser['username']) ?></span>
        </a>
        <form method="post" action="<?= e(app_url('auth/logout.php')) ?>" class="sidebar-signout">
            <?= csrf_field() ?>
            <button type="submit" class="sidebar-link sidebar-signout-btn">
                <span class="sidebar-icon">&#8617;</span>
                <span class="sidebar-label">Sign out</span>
            </button>
        </form>
    </div>
</aside>
