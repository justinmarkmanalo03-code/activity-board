<?php

require_once __DIR__ . '/../app/functions.php';

if (current_user()) {
    redirect(app_url('pages/dashboard.php'));
}

$error = '';
$username = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');

    if (!verify_csrf($_POST['csrf'] ?? null)) {
        $error = 'Your session expired. Please try again.';
    } elseif ($username === '' || $password === '') {
        $error = 'Enter your username and password.';
    } else {
        $stmt = db()->prepare('SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1');
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['user_id'] = (int) $user['id'];
            session_mark_active();
            redirect(app_url('pages/dashboard.php'));
        }

        $error = 'Incorrect username or password.';
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
    <title>Sign in - Activity Board</title>
    <link rel="stylesheet" href="<?= e(asset_url('assets/style.css')) ?>">
</head>
<body class="auth-body">
    <div class="bg-decor" aria-hidden="true"><span></span><span></span><span></span></div>
    <main class="auth-card">
        <div class="brand">Activity Board</div>
        <h1>Welcome back</h1>
        <p class="lead">Sign in to open your boards.</p>

        <?php if ($error !== ''): ?>
            <div class="alert"><?= e($error) ?></div>
        <?php endif; ?>

        <form method="post" class="stack">
            <?= csrf_field() ?>
            <label>
                Username
                <input type="text" name="username" value="<?= e($username) ?>" maxlength="30" autocomplete="username" required autofocus>
            </label>
            <label>
                Password
                <input type="password" name="password" autocomplete="current-password" required>
            </label>
            <button type="submit" class="btn btn-primary btn-block">Sign in</button>
        </form>

        <p class="auth-foot">New here? <a href="<?= e(app_url('auth/register.php')) ?>">Create a free account</a></p>
    </main>
</body>
</html>
