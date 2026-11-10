<?php

require_once __DIR__ . '/../app/functions.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

$user = current_user();

if (!$user) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Your session has expired. Please sign in again.']);
    exit;
}

if (!is_admin($user)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Admin access required.']);
    exit;
}

try {
    $stats = collect_storage_stats();
    $stats['ok'] = true;

    echo json_encode($stats, JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $e) {
    error_log('Admin storage API failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not read storage stats.']);
}
