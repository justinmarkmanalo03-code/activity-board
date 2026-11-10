<?php

require_once __DIR__ . '/../app/functions.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && verify_csrf($_POST['csrf'] ?? null)) {
    session_clear();
}

redirect(app_url('auth/login.php'));
