<?php

require_once __DIR__ . '/../app/functions.php';

$user = current_user();

if (!$user) {
    http_response_code(401);
    exit('Please sign in to download this file.');
}

$attachmentId = (int) ($_GET['id'] ?? 0);
$attachment = $attachmentId > 0 ? card_attachment_for_user($attachmentId, (int) $user['id']) : null;

if (!$attachment) {
    http_response_code(404);
    exit('File not found.');
}

$path = ATTACHMENT_DIR . '/' . basename((string) $attachment['stored_name']);

if (!is_file($path)) {
    http_response_code(404);
    exit('File is no longer available.');
}

$name = (string) $attachment['original_name'];
$fallback = preg_replace('/[^A-Za-z0-9._ -]/', '_', $name) ?: 'download';
$fallback = str_replace(['"', '\\'], '_', $fallback);
$mime = (string) ($attachment['mime_type'] ?? '') ?: 'application/octet-stream';

header('Content-Type: ' . $mime);
header('Content-Length: ' . (string) filesize($path));
header('Content-Disposition: attachment; filename="' . $fallback . '"; filename*=UTF-8\'\'' . rawurlencode($name));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=0, must-revalidate');

readfile($path);
exit;
