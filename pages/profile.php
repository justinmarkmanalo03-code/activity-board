<?php

require_once __DIR__ . '/../app/functions.php';

$user = require_login();
$error = '';
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = (string) ($_POST['action'] ?? 'avatar');

    if (!verify_csrf($_POST['csrf'] ?? null)) {
        $error = 'Your session expired. Please try again.';
    } elseif ($action === 'avatar_delete') {
        if (!empty($user['avatar'])) {
            delete_avatar_file($user['avatar']);
            try {
                db()->prepare('UPDATE users SET avatar = NULL WHERE id = ?')->execute([(int) $user['id']]);
                $user['avatar'] = null;
                $success = 'Your avatar was removed and reset to your initials.';
            } catch (Throwable $e) {
                $error = 'Could not remove avatar. Please try again.';
            }
        }
    } elseif ($action === 'avatar') {
        if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] === UPLOAD_ERR_NO_FILE) {
            $error = 'Choose an image to upload.';
        } elseif ($_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
            $error = 'The avatar upload failed. Please try a smaller image.';
        } elseif ((int) $_FILES['avatar']['size'] > AVATAR_MAX_BYTES) {
            $error = 'Avatar images must be ' . format_bytes(AVATAR_MAX_BYTES) . ' or smaller.';
        } else {
            $file = $_FILES['avatar'];
            $mime = function_exists('finfo_open')
                ? (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name'])
                : false;
            $extensions = [
                'image/jpeg' => 'jpg',
                'image/png' => 'png',
                'image/gif' => 'gif',
                'image/webp' => 'webp',
            ];

            if (!isset($extensions[$mime]) || @getimagesize($file['tmp_name']) === false) {
                $error = 'Upload a valid JPG, PNG, GIF, or WebP image.';
            } elseif (!is_dir(AVATAR_DIR) && !mkdir(AVATAR_DIR, 0755, true) && !is_dir(AVATAR_DIR)) {
                $error = 'Could not prepare avatar storage. Please try again later.';
            } else {
                $filename = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
                $relativePath = AVATAR_URL_PREFIX . $filename;
                $destination = AVATAR_DIR . '/' . $filename;

                if (!move_uploaded_file($file['tmp_name'], $destination)) {
                    $error = 'Could not save your avatar. Please try again.';
                } else {
                    try {
                        db()->prepare('UPDATE users SET avatar = ? WHERE id = ?')->execute([$relativePath, (int) $user['id']]);
                        delete_avatar_file($user['avatar'] ?? null);
                        $user['avatar'] = $relativePath;
                        $success = 'Your avatar has been updated!';
                    } catch (Throwable $e) {
                        @unlink($destination);
                        error_log('Avatar update failed: ' . $e->getMessage());
                        $error = 'Could not update your profile. Please try again.';
                    }
                }
            }
        }
    } elseif ($action === 'password') {
        $currentPass = (string) ($_POST['current_password'] ?? '');
        $newPass = (string) ($_POST['new_password'] ?? '');
        $confirmPass = (string) ($_POST['confirm_password'] ?? '');

        if ($currentPass === '' || $newPass === '') {
            $error = 'Please fill in all password fields.';
        } elseif (strlen($newPass) < 8) {
            $error = 'New password must be at least 8 characters long.';
        } elseif ($newPass !== $confirmPass) {
            $error = 'New passwords do not match.';
        } else {
            $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([(int) $user['id']]);
            $hash = (string) $stmt->fetchColumn();

            if (!password_verify($currentPass, $hash)) {
                $error = 'Current password was incorrect.';
            } else {
                $newHash = password_hash($newPass, PASSWORD_DEFAULT);
                db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$newHash, (int) $user['id']]);
                $success = 'Your password has been updated successfully!';
            }
        }
    }
}

// User stats and navigation
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

$ownedBoardsCount = 0;
foreach ($boards as $b) {
    if ((int) ($b['is_owner'] ?? 0) === 1) {
        $ownedBoardsCount++;
    }
}

$assignedCount = 0;
try {
    $stmt = db()->prepare('SELECT COUNT(*) FROM card_assignees WHERE user_id = ?');
    $stmt->execute([(int) $user['id']]);
    $assignedCount = (int) $stmt->fetchColumn();
} catch (Throwable $e) {
    $assignedCount = 0;
}

$sidebarUser = $user;
$sidebarBoards = $boards;
$sidebarLists = [];
$sidebarShowLists = false;
$sidebarBoardId = 0;
$sidebarActive = 'profile';

$joinedDate = !empty($user['created_at']) ? date('M j, Y', strtotime((string) $user['created_at'])) : 'Recent';
$isAdminUser = is_admin($user);
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="<?= e(asset_url('assets/favicon.svg')) ?>" type="image/svg+xml">
    <link rel="shortcut icon" href="<?= e(asset_url('assets/favicon.svg')) ?>" type="image/svg+xml">
    <title>Your Profile - Activity Board</title>
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
                    <span class="user-chip">@<?= e($user['username']) ?></span>
                </div>
            </header>

            <main class="page">
                <div class="page-head">
                    <div>
                        <p class="eyebrow">Account Settings</p>
                        <h1>Your Profile</h1>
                        <p class="muted">Manage your personal identity, avatar image, and account credentials.</p>
                    </div>
                </div>

                <?php if ($error !== ''): ?>
                    <div class="alert" style="margin-top: 18px;"><?= e($error) ?></div>
                <?php endif; ?>
                <?php if ($success !== ''): ?>
                    <div class="alert alert-success" style="margin-top: 18px;"><?= e($success) ?></div>
                <?php endif; ?>

                <div class="profile-grid">
                    <!-- Left column: Summary & stats -->
                    <aside class="profile-card-col">
                        <section class="profile-summary-card">
                            <div class="profile-avatar-lg">
                                <?= user_avatar($user['username'], $user['avatar'] ?? null, 'profile-avatar-lg') ?>
                                <?= presence_dot((int) $user['id'], true) ?>
                            </div>
                            <h2 class="profile-summary-name">@<?= e($user['username']) ?></h2>
                            <span class="profile-role-badge">
                                <?= $isAdminUser ? 'Administrator' : 'Workspace Member' ?>
                            </span>

                            <div class="profile-stats-row">
                                <div class="profile-stat-box">
                                    <span class="profile-stat-val"><?= count($boards) ?></span>
                                    <span class="profile-stat-lbl">Boards</span>
                                </div>
                                <div class="profile-stat-box">
                                    <span class="profile-stat-val"><?= $ownedBoardsCount ?></span>
                                    <span class="profile-stat-lbl">Owned</span>
                                </div>
                                <div class="profile-stat-box">
                                    <span class="profile-stat-val"><?= $assignedCount ?></span>
                                    <span class="profile-stat-lbl">Assigned</span>
                                </div>
                            </div>

                            <div class="profile-details-list">
                                <div class="profile-detail-item">
                                    <span class="profile-detail-label">Username</span>
                                    <span class="profile-detail-value">@<?= e($user['username']) ?></span>
                                </div>
                                <div class="profile-detail-item">
                                    <span class="profile-detail-label">Member Since</span>
                                    <span class="profile-detail-value"><?= e($joinedDate) ?></span>
                                </div>
                                <div class="profile-detail-item">
                                    <span class="profile-detail-label">Status</span>
                                    <span class="profile-detail-value" style="color:#16a34a;display:inline-flex;align-items:center;gap:6px;">
                                        <span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;"></span> Active
                                    </span>
                                </div>
                            </div>
                        </section>
                    </aside>

                    <!-- Right column: Edit avatar & Password forms -->
                    <div class="profile-card-col">
                        <!-- Panel A: Profile Avatar -->
                        <section class="profile-panel">
                            <div class="profile-panel-head">
                                <h2>Profile Avatar</h2>
                                <p>Upload a custom image to represent yourself across all boards and card assignments.</p>
                            </div>

                            <form method="post" enctype="multipart/form-data" id="avatarForm">
                                <?= csrf_field() ?>
                                <input type="hidden" name="action" value="avatar">

                                <div class="avatar-preview-box" id="avatarPreviewContainer">
                                    <span id="avatarPreviewHolder">
                                        <?= user_avatar($user['username'], $user['avatar'] ?? null, 'avatar-sm') ?>
                                    </span>
                                    <div>
                                        <strong id="avatarPreviewText"><?= $user['avatar'] ? 'Custom avatar active' : 'Default initials active' ?></strong>
                                        <p class="muted small" id="avatarPreviewSub">Select a new image below to preview and save.</p>
                                    </div>
                                </div>

                                <label class="avatar-upload-zone" id="avatarDropzone">
                                    <input type="file" name="avatar" id="avatarInput" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none;" required>
                                    <span class="avatar-upload-icon">&#128247;</span>
                                    <span class="avatar-upload-prompt">
                                        <span id="dropzoneLabel"><strong>Click to browse</strong> or drag and drop your photo</span>
                                    </span>
                                    <span class="muted small">Supported: JPG, PNG, GIF, WebP (Max 2 MB)</span>
                                </label>

                                <div class="profile-actions-row">
                                    <button type="submit" class="btn btn-primary" id="saveAvatarBtn">Save Avatar</button>
                                    <?php if (!empty($user['avatar'])): ?>
                                        <button type="button" class="btn btn-danger-ghost btn-small" id="removeAvatarBtn">Remove Photo</button>
                                    <?php endif; ?>
                                </div>
                            </form>

                            <?php if (!empty($user['avatar'])): ?>
                                <form method="post" id="removeAvatarForm" style="display:none;">
                                    <?= csrf_field() ?>
                                    <input type="hidden" name="action" value="avatar_delete">
                                </form>
                            <?php endif; ?>
                        </section>

                        <!-- Panel B: Password & Security -->
                        <section class="profile-panel">
                            <div class="profile-panel-head">
                                <h2>Password & Security</h2>
                                <p>Ensure your account remains secure by choosing a strong password with at least 8 characters.</p>
                            </div>

                            <form method="post" class="stack" style="margin-top: 16px;">
                                <?= csrf_field() ?>
                                <input type="hidden" name="action" value="password">

                                <label>
                                    Current Password
                                    <input type="password" name="current_password" autocomplete="current-password" required placeholder="Enter your current password">
                                </label>

                                <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                                    <label>
                                        New Password
                                        <input type="password" name="new_password" minlength="8" autocomplete="new-password" required placeholder="Min. 8 characters">
                                    </label>
                                    <label>
                                        Confirm New Password
                                        <input type="password" name="confirm_password" minlength="8" autocomplete="new-password" required placeholder="Repeat new password">
                                    </label>
                                </div>

                                <div class="profile-actions-row">
                                    <button type="submit" class="btn btn-primary">Update Password</button>
                                </div>
                            </form>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    </div>

    <script>
        window.PRESENCE = {
            endpoint: '<?= e(app_url('api/index.php')) ?>',
            csrf: '<?= e(csrf_token()) ?>',
            interval: <?= (int) PRESENCE_PING_SECONDS ?>
        };

        // Live image preview
        const avatarInput = document.getElementById('avatarInput');
        const avatarPreviewHolder = document.getElementById('avatarPreviewHolder');
        const avatarPreviewText = document.getElementById('avatarPreviewText');
        const dropzoneLabel = document.getElementById('dropzoneLabel');

        if (avatarInput) {
            avatarInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                if (file.size > <?= (int) AVATAR_MAX_BYTES ?>) {
                    alert('File is too large. Maximum size is 2 MB.');
                    avatarInput.value = '';
                    return;
                }

                dropzoneLabel.innerHTML = 'Selected: <strong>' + (file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name) + '</strong>';

                const reader = new FileReader();
                reader.onload = (loadEvt) => {
                    avatarPreviewHolder.innerHTML = '<span class="avatar avatar-sm"><img src="' + loadEvt.target.result + '" alt="Preview"></span>';
                    avatarPreviewText.textContent = 'Previewing new photo';
                };
                reader.readAsDataURL(file);
            });
        }

        const removeAvatarBtn = document.getElementById('removeAvatarBtn');
        const removeAvatarForm = document.getElementById('removeAvatarForm');
        if (removeAvatarBtn && removeAvatarForm) {
            removeAvatarBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to remove your profile photo and reset to your initials?')) {
                    removeAvatarForm.submit();
                }
            });
        }
    </script>
    <script src="<?= e(asset_url('assets/presence.js')) ?>"></script>
    <script src="<?= e(asset_url('assets/sidebar.js')) ?>"></script>
</body>
</html>
