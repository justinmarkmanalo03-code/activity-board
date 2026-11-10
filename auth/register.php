<?php

require_once __DIR__ . '/../app/functions.php';

if (current_user()) {
    redirect(app_url('pages/dashboard.php'));
}

$errors = [];
$username = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    $confirm = (string) ($_POST['confirm'] ?? '');

    if (!verify_csrf($_POST['csrf'] ?? null)) {
        $errors[] = 'Your session expired. Please try again.';
    }
    if (!preg_match('/^[A-Za-z0-9_]{3,30}$/', $username)) {
        $errors[] = 'Username must be 3-30 characters using letters, numbers, or underscores.';
    }
    if (strlen($password) < 8) {
        $errors[] = 'Password must be at least 8 characters.';
    }
    if ($password !== $confirm) {
        $errors[] = 'Passwords do not match.';
    }

    if (!$errors) {
        $stmt = db()->prepare('SELECT 1 FROM users WHERE username = ? LIMIT 1');
        $stmt->execute([$username]);

        if ($stmt->fetchColumn()) {
            $errors[] = 'That username is already taken.';
        } else {
            $stmt = db()->prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
            $stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);

            session_regenerate_id(true);
            $_SESSION['user_id'] = (int) db()->lastInsertId();
            session_mark_active();
            redirect(app_url('pages/dashboard.php'));
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="<?= e(asset_url('assets/favicon.svg')) ?>" type="image/svg+xml">
    <link rel="shortcut icon" href="<?= e(asset_url('assets/favicon.svg')) ?>" type="image/svg+xml">
    <title>Create account - Activity Board</title>
    <link rel="stylesheet" href="<?= e(asset_url('assets/style.css')) ?>">
</head>
<body class="auth-body">
    <div class="bg-decor" aria-hidden="true"><span></span><span></span><span></span></div>
    <main class="auth-card">
        <div class="brand">Activity Board</div>
        <h1>Create your account</h1>
        <p class="lead">Free boards, lists, and cards. No email needed.</p>

        <?php if ($errors): ?>
            <div class="alert">
                <ul>
                    <?php foreach ($errors as $error): ?>
                        <li><?= e($error) ?></li>
                    <?php endforeach; ?>
                </ul>
            </div>
        <?php endif; ?>

        <form method="post" class="stack">
            <?= csrf_field() ?>
            <label>
                Username
                <input type="text" name="username" value="<?= e($username) ?>" maxlength="30" pattern="[A-Za-z0-9_]{3,30}" autocomplete="username" required autofocus>
            </label>
            <label>
                Password
                <input type="password" name="password" minlength="8" autocomplete="new-password" required>
            </label>
            <label>
                Confirm password
                <input type="password" name="confirm" minlength="8" autocomplete="new-password" required>
            </label>
            <button type="submit" class="btn btn-primary btn-block">Create account</button>
        </form>

        <p class="auth-foot">Already have an account? <a href="<?= e(app_url('auth/login.php')) ?>">Sign in</a></p>
    </main>
</body>
</html>
