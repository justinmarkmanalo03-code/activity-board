<?php

// Copy this file to app/config.php and fill in your real credentials.
// NEVER commit app/config.php with real passwords.

ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

set_exception_handler(function (Throwable $e) {
    http_response_code(500);
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    if (strpos($script, '/api/') !== false) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
        exit;
    }
    echo '<div style="font-family:system-ui,sans-serif;padding:24px;max-width:800px;margin:30px auto;background:#fff1f2;border:1px solid #f43f5e;border-radius:12px;color:#9f1239;">';
    echo '<h2 style="margin:0 0 10px 0;">Application Notice</h2>';
    echo '<p style="font-size:15px;margin:0 0 12px 0;"><strong>' . htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8') . '</strong></p>';
    echo '<pre style="background:#fff;padding:12px;border-radius:6px;overflow:auto;font-size:12px;color:#333;">' . htmlspecialchars($e->getFile() . ':' . $e->getLine() . "\n" . $e->getTraceAsString(), ENT_QUOTES, 'UTF-8') . '</pre>';
    echo '<p style="margin:12px 0 0 0;"><a href="javascript:history.back()" style="color:#e11d48;font-weight:600;">&larr; Go back</a></p>';
    echo '</div>';
    exit;
});

// --- Fill these in with your real database credentials ---
define('DB_HOST', 'your-db-host.example.com');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');

// --- Project root on disk (config.php lives in /app) ---
define('APP_ROOT', dirname(__DIR__));

// --- Public URL of this app ---
$scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
$scriptDirectory = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
$appBase = preg_replace('#/(?:app|auth|pages|api)$#', '', $scriptDirectory);
define('APP_BASE_PATH', $appBase === null || $appBase === '/' ? '' : $appBase);

// --- Admin storage monitor ---
define('STORAGE_LIMIT_BYTES', 5 * 1024 * 1024 * 1024);
define('STORAGE_REFRESH_SECONDS', 30);

// --- Presence ---
define('PRESENCE_TTL_SECONDS', 120);
define('PRESENCE_PING_SECONDS', 15);

// --- Rolling session lifetime ---
define('SESSION_IDLE_SECONDS', 7 * 24 * 60 * 60);
define('SESSION_TOUCH_SECONDS', 60);

// --- Profile avatars ---
define('AVATAR_MAX_BYTES', 2 * 1024 * 1024);
define('AVATAR_DIR', APP_ROOT . '/uploads/avatars');
define('AVATAR_URL_PREFIX', 'uploads/avatars/');

// --- Card attachments ---
define('ATTACHMENT_MAX_BYTES', 25 * 1024 * 1024);
define('ATTACHMENT_DIR', APP_ROOT . '/uploads/cards');

if (session_status() !== PHP_SESSION_ACTIVE) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');

    ini_set('session.gc_maxlifetime', (string) SESSION_IDLE_SECONDS);

    session_set_cookie_params([
        'lifetime' => SESSION_IDLE_SECONDS,
        'path' => APP_BASE_PATH !== '' ? APP_BASE_PATH . '/' : '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => $secure,
    ]);

    session_start();
}