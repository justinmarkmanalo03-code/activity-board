<?php

require_once __DIR__ . '/db.php';

function app_base_path(): string
{
    return APP_BASE_PATH;
}

function app_url(string $path = ''): string
{
    $path = ltrim($path, '/');
    $base = app_base_path();

    if ($path === '') {
        return $base === '' ? '/' : $base . '/';
    }

    return $base . '/' . $path;
}

function asset_url(string $path): string
{
    $path = ltrim($path, '/');
    $file = APP_ROOT . '/' . $path;
    $version = is_file($file) ? (int) filemtime($file) : 0;

    return app_url($path) . ($version > 0 ? '?v=' . $version : '');
}

function e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function display_date($date): string
{
    if (!$date) {
        return '';
    }

    $timestamp = strtotime((string) $date);
    return $timestamp ? date('M j', $timestamp) : (string) $date;
}

function format_due($date, $time = null): string
{
    if (!$date) {
        return '';
    }

    $timestamp = strtotime((string) $date . ($time ? ' ' . $time : ''));

    if (!$timestamp) {
        return (string) $date;
    }

    return $time ? date('M j, g:i A', $timestamp) : date('M j', $timestamp);
}

function session_clear(): void
{
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            $params['secure'],
            $params['httponly']
        );
    }

    session_destroy();
}

function session_mark_active(): void
{
    $_SESSION['last_activity'] = time();
}

function session_enforce_idle_timeout(): void
{
    if (empty($_SESSION['user_id'])) {
        return;
    }

    $now = time();
    $last = (int) ($_SESSION['last_activity'] ?? 0);

    if ($last > 0 && ($now - $last) > SESSION_IDLE_SECONDS) {
        session_clear();

        return;
    }

    if ($last === 0 || ($now - $last) >= SESSION_TOUCH_SECONDS) {
        session_mark_active();
    }
}

function current_user(): ?array
{
    session_enforce_idle_timeout();

    if (empty($_SESSION['user_id'])) {
        return null;
    }

    static $loaded = false;
    static $user = null;

    if (!$loaded) {
        $userId = (int) $_SESSION['user_id'];

        try {
            $stmt = db()->prepare('SELECT id, username, avatar, last_seen, created_at FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$userId]);
            $row = $stmt->fetch();
        } catch (Throwable $e) {
            $stmt = db()->prepare('SELECT id, username, created_at FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$userId]);
            $row = $stmt->fetch();

            if ($row) {
                $row['avatar'] = null;
                $row['last_seen'] = null;
            }
        }

        if ($row) {
            $user = $row;

            $lastSeen = !empty($row['last_seen']) ? strtotime((string) $row['last_seen']) : 0;

            if (time() - $lastSeen >= PRESENCE_PING_SECONDS) {
                try {
                    db()->prepare('UPDATE users SET last_seen = NOW() WHERE id = ?')->execute([$userId]);
                    $user['last_seen'] = date('Y-m-d H:i:s');
                } catch (Throwable $e) {
                    // Presence columns not migrated yet; keep the app working.
                }
            }
        } else {
            unset($_SESSION['user_id']);
        }

        $loaded = true;
    }

    return $user;
}

function avatar_initial(string $username): string
{
    $username = trim($username);

    return $username === '' ? '?' : strtoupper(substr($username, 0, 1));
}

function user_avatar(?string $username, ?string $avatar, string $extraClass = ''): string
{
    $username = (string) $username;
    $classes = trim('avatar ' . $extraClass);

    $content = $avatar
        ? '<img src="' . e(app_url($avatar)) . '" alt="' . e($username) . '" loading="lazy">'
        : '<span class="avatar-initials">' . e(avatar_initial($username)) . '</span>';

    return '<span class="' . e($classes) . '">' . $content . '</span>';
}

function is_user_online($lastSeen): bool
{
    if (empty($lastSeen)) {
        return false;
    }

    $timestamp = strtotime((string) $lastSeen);

    return $timestamp !== false && (time() - $timestamp) <= PRESENCE_TTL_SECONDS;
}

function presence_dot(int $userId, bool $online): string
{
    $label = $online ? 'Online' : 'Offline';

    return '<span class="presence-dot ' . ($online ? 'online' : 'offline') . '" data-presence-user="' . $userId . '" title="' . $label . '"></span>';
}

function delete_avatar_file(?string $relativePath): void
{
    if (!$relativePath || strpos($relativePath, AVATAR_URL_PREFIX) !== 0) {
        return;
    }

    $path = AVATAR_DIR . '/' . basename($relativePath);

    if (is_file($path)) {
        @unlink($path);
    }
}

function require_login(): array
{
    $user = current_user();

    if (!$user) {
        header('Location: ' . app_url('auth/login.php'));
        exit;
    }

    return $user;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf" value="' . e(csrf_token()) . '">';
}

function verify_csrf($token): bool
{
    return is_string($token)
        && !empty($_SESSION['csrf'])
        && hash_equals($_SESSION['csrf'], $token);
}

function redirect(string $path): void
{
    header('Location: ' . $path);
    exit;
}

function board_for_user(int $boardId, int $userId): ?array
{
    $stmt = db()->prepare(
        'SELECT b.id, b.owner_id, b.title, b.created_at,
                (b.owner_id = ?) AS is_owner, m.role
           FROM boards b
           JOIN board_members m ON m.board_id = b.id AND m.user_id = ?
          WHERE b.id = ?
          LIMIT 1'
    );
    $stmt->execute([$userId, $userId, $boardId]);
    $row = $stmt->fetch();

    return $row ?: null;
}

function board_role(array $board): string
{
    if ((int) ($board['is_owner'] ?? 0) === 1) {
        return 'owner';
    }

    $role = (string) ($board['role'] ?? 'member');

    return in_array($role, ['manager', 'member'], true) ? $role : 'member';
}

function board_can_manage(array $board): bool
{
    return in_array(board_role($board), ['owner', 'manager'], true);
}

function role_label(string $role): string
{
    return ucfirst($role);
}

function list_for_user(int $listId, int $userId): ?array
{
    $stmt = db()->prepare(
        'SELECT l.id, l.board_id, l.title, l.color, l.position
           FROM lists l
           JOIN board_members m ON m.board_id = l.board_id AND m.user_id = ?
          WHERE l.id = ?
          LIMIT 1'
    );
    $stmt->execute([$userId, $listId]);
    $row = $stmt->fetch();

    return $row ?: null;
}

function card_for_user(int $cardId, int $userId): ?array
{
    $stmt = db()->prepare(
        'SELECT c.id, c.list_id, c.title, c.description, c.created_by,
                c.due_date, c.due_time, c.priority, c.position,
                l.board_id,
                creator.username AS creator_name
           FROM cards c
           JOIN lists l ON l.id = c.list_id
           JOIN board_members m ON m.board_id = l.board_id AND m.user_id = ?
           LEFT JOIN users creator ON creator.id = c.created_by
          WHERE c.id = ?
          LIMIT 1'
    );
    $stmt->execute([$userId, $cardId]);
    $row = $stmt->fetch();

    return $row ?: null;
}

function card_assignees(int $cardId): array
{
    $stmt = db()->prepare(
        'SELECT u.id, u.username, u.avatar, u.last_seen
           FROM card_assignees ca
           JOIN users u ON u.id = ca.user_id
          WHERE ca.card_id = ?
          ORDER BY u.username ASC'
    );
    $stmt->execute([$cardId]);

    $assignees = [];

    foreach ($stmt->fetchAll() as $row) {
        $assignees[] = [
            'id' => (int) $row['id'],
            'username' => $row['username'],
            'avatar' => $row['avatar'],
            'online' => is_user_online($row['last_seen']),
        ];
    }

    return $assignees;
}

function card_attachment_extensions(): array
{
    return [
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'txt', 'csv', 'rtf', 'odt', 'ods', 'odp', 'zip',
        'png', 'jpg', 'jpeg', 'gif', 'webp',
    ];
}

function card_attachments(int $cardId): array
{
    $stmt = db()->prepare(
        'SELECT a.id, a.card_id, a.uploaded_by, a.original_name, a.mime_type,
                a.size_bytes, a.created_at, u.username AS uploader_name
           FROM card_attachments a
           LEFT JOIN users u ON u.id = a.uploaded_by
          WHERE a.card_id = ?
          ORDER BY a.created_at ASC, a.id ASC'
    );
    $stmt->execute([$cardId]);

    $attachments = [];

    foreach ($stmt->fetchAll() as $row) {
        $attachments[] = [
            'id' => (int) $row['id'],
            'card_id' => (int) $row['card_id'],
            'uploaded_by' => $row['uploaded_by'] !== null ? (int) $row['uploaded_by'] : null,
            'uploader_name' => $row['uploader_name'],
            'name' => $row['original_name'],
            'mime_type' => $row['mime_type'],
            'size_bytes' => (int) $row['size_bytes'],
            'size_label' => format_bytes((int) $row['size_bytes']),
            'url' => app_url('api/attachment.php?id=' . (int) $row['id']),
            'created_at' => $row['created_at'],
        ];
    }

    return $attachments;
}

function card_attachment_for_user(int $attachmentId, int $userId): ?array
{
    $stmt = db()->prepare(
        'SELECT a.*, c.list_id, l.board_id
           FROM card_attachments a
           JOIN cards c ON c.id = a.card_id
           JOIN lists l ON l.id = c.list_id
           JOIN board_members m ON m.board_id = l.board_id AND m.user_id = ?
          WHERE a.id = ?
          LIMIT 1'
    );
    $stmt->execute([$userId, $attachmentId]);
    $row = $stmt->fetch();

    return $row ?: null;
}

function card_attachment_store(array $file, int $cardId, int $userId): void
{
    $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);

    if ($error !== UPLOAD_ERR_OK) {
        switch ($error) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                throw new RuntimeException('That file is larger than the server allows.');
            case UPLOAD_ERR_PARTIAL:
                throw new RuntimeException('The upload was interrupted. Please try again.');
            case UPLOAD_ERR_NO_FILE:
                throw new RuntimeException('Choose a file to upload.');
            default:
                throw new RuntimeException('The file could not be uploaded.');
        }
    }

    $size = (int) ($file['size'] ?? 0);

    if ($size <= 0) {
        throw new RuntimeException('The uploaded file is empty.');
    }
    if ($size > ATTACHMENT_MAX_BYTES) {
        throw new RuntimeException('Files must be ' . format_bytes(ATTACHMENT_MAX_BYTES) . ' or smaller.');
    }

    $original = trim((string) ($file['name'] ?? 'file'));
    $original = preg_replace('/[\x00-\x1F\x7F]+/', '', $original) ?: 'file';

    if (text_length($original) > 180) {
        $original = function_exists('mb_substr')
            ? mb_substr($original, 0, 180, 'UTF-8')
            : substr($original, 0, 180);
    }

    $extension = strtolower(pathinfo($original, PATHINFO_EXTENSION));

    if ($extension === '' || !in_array($extension, card_attachment_extensions(), true)) {
        throw new RuntimeException('That file type is not allowed.');
    }

    $tmp = (string) ($file['tmp_name'] ?? '');

    if ($tmp === '' || !is_uploaded_file($tmp)) {
        throw new RuntimeException('The file could not be uploaded.');
    }

    if (!is_dir(ATTACHMENT_DIR) && !mkdir(ATTACHMENT_DIR, 0755, true) && !is_dir(ATTACHMENT_DIR)) {
        throw new RuntimeException('The upload folder is not writable.');
    }

    $storedName = bin2hex(random_bytes(16)) . '.' . $extension;
    $target = ATTACHMENT_DIR . '/' . $storedName;

    if (!move_uploaded_file($tmp, $target)) {
        throw new RuntimeException('The file could not be saved.');
    }

    $mime = 'application/octet-stream';

    if (function_exists('finfo_open')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);

        if ($finfo) {
            $detected = finfo_file($finfo, $target);
            finfo_close($finfo);

            if (is_string($detected) && $detected !== '') {
                $mime = $detected;
            }
        }
    }

    if (text_length($mime) > 120) {
        $mime = substr($mime, 0, 120);
    }

    try {
        db()->prepare(
            'INSERT INTO card_attachments (card_id, uploaded_by, stored_name, original_name, mime_type, size_bytes)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$cardId, $userId, $storedName, $original, $mime, $size]);
    } catch (Throwable $e) {
        @unlink($target);
        throw $e;
    }
}

function card_attachment_delete(array $attachment): void
{
    db()->prepare('DELETE FROM card_attachments WHERE id = ?')
        ->execute([(int) $attachment['id']]);

    $path = ATTACHMENT_DIR . '/' . basename((string) $attachment['stored_name']);

    if (is_file($path)) {
        @unlink($path);
    }
}

function sync_card_assignees(int $cardId, array $userIds): void
{
    $pdo = db();
    $pdo->beginTransaction();

    try {
        $pdo->prepare('DELETE FROM card_assignees WHERE card_id = ?')->execute([$cardId]);

        if ($userIds) {
            $insert = $pdo->prepare('INSERT INTO card_assignees (card_id, user_id) VALUES (?, ?)');

            foreach ($userIds as $assigneeId) {
                $insert->execute([$cardId, $assigneeId]);
            }
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function board_member_exists(int $boardId, int $userId): bool
{
    $stmt = db()->prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ? LIMIT 1');
    $stmt->execute([$boardId, $userId]);

    return (bool) $stmt->fetchColumn();
}

function next_position(string $table, string $column, int $value): int
{
    $allowed = [
        'lists' => 'board_id',
        'cards' => 'list_id',
    ];

    if (!isset($allowed[$table]) || $allowed[$table] !== $column) {
        throw new InvalidArgumentException('Invalid position target.');
    }

    $stmt = db()->prepare("SELECT COALESCE(MAX(position), -1) + 1 FROM {$table} WHERE {$column} = ?");
    $stmt->execute([$value]);

    return (int) $stmt->fetchColumn();
}

function is_admin(?array $user = null): bool
{
    $user = $user ?? current_user();

    if (!$user) {
        return false;
    }

    try {
        $stmt = db()->prepare('SELECT is_admin FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([(int) $user['id']]);

        return (int) $stmt->fetchColumn() === 1;
    } catch (Throwable $e) {
        return false;
    }
}

function require_admin(): array
{
    $user = require_login();

    if (!is_admin($user)) {
        http_response_code(403);
        exit('Admin access required.');
    }

    return $user;
}

function format_bytes(int $bytes): string
{
    if ($bytes <= 0) {
        return '0 B';
    }

    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $power = min((int) floor(log($bytes, 1024)), count($units) - 1);
    $value = $bytes / (1024 ** $power);

    return round($value, $power === 0 ? 0 : 1) . ' ' . $units[$power];
}

function db_storage_stats(): array
{
    $tables = [];
    $total = 0;

    try {
        $stmt = db()->prepare(
            'SELECT TABLE_NAME AS name,
                    DATA_LENGTH AS data_bytes,
                    INDEX_LENGTH AS index_bytes,
                    TABLE_ROWS AS rows_est
               FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = ?
              ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC'
        );
        $stmt->execute([DB_NAME]);

        foreach ($stmt->fetchAll() as $row) {
            $data = (int) $row['data_bytes'];
            $index = (int) $row['index_bytes'];

            $tables[] = [
                'name' => $row['name'],
                'data_bytes' => $data,
                'index_bytes' => $index,
                'total_bytes' => $data + $index,
                'rows_est' => (int) $row['rows_est'],
            ];

            $total += $data + $index;
        }
    } catch (Throwable $e) {
        error_log('DB storage stats failed: ' . $e->getMessage());
    }

    return [
        'name' => DB_NAME,
        'tables' => $tables,
        'table_count' => count($tables),
        'total_bytes' => $total,
    ];
}

function dir_storage_stats(string $root): array
{
    $root = rtrim(str_replace('\\', '/', realpath($root) ?: $root), '/');
    $total = 0;
    $count = 0;
    $byTop = [];
    $largest = [];

    try {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );

        foreach ($iterator as $file) {
            if (!$file->isFile()) {
                continue;
            }

            $size = (int) $file->getSize();
            $path = str_replace('\\', '/', $file->getPathname());
            $relative = ltrim(substr($path, strlen($root)), '/');
            $parts = explode('/', $relative);
            $top = $parts[0] !== '' ? $parts[0] : $relative;

            $total += $size;
            $count++;
            $byTop[$top] = ($byTop[$top] ?? 0) + $size;
            $largest[] = ['path' => $relative, 'size' => $size];
        }
    } catch (Throwable $e) {
        error_log('Directory scan failed: ' . $e->getMessage());
    }

    arsort($byTop);
    usort($largest, static function (array $a, array $b): int {
        return $b['size'] <=> $a['size'];
    });

    $byTopList = [];
    foreach ($byTop as $name => $bytes) {
        $byTopList[] = ['name' => $name, 'bytes' => $bytes];
    }

    return [
        'root' => $root,
        'total_bytes' => $total,
        'count' => $count,
        'by_top' => $byTopList,
        'largest' => array_slice($largest, 0, 12),
    ];
}

function disk_storage_stats(string $path): array
{
    $free = function_exists('disk_free_space') ? @disk_free_space($path) : false;
    $total = function_exists('disk_total_space') ? @disk_total_space($path) : false;

    return [
        'free_bytes' => $free === false ? null : (int) $free,
        'total_bytes' => $total === false ? null : (int) $total,
        'used_bytes' => ($free === false || $total === false) ? null : (int) ($total - $free),
    ];
}

function collect_storage_stats(): array
{
    $files = dir_storage_stats(APP_ROOT);
    $database = db_storage_stats();
    $disk = disk_storage_stats(APP_ROOT);
    $limit = defined('STORAGE_LIMIT_BYTES') ? (int) STORAGE_LIMIT_BYTES : 0;

    $total = $files['total_bytes'] + $database['total_bytes'];
    $percent = $limit > 0 ? min(100, ($total / $limit) * 100) : null;

    return [
        'generated_at' => date('c'),
        'limit_bytes' => $limit,
        'total_bytes' => $total,
        'file_bytes' => $files['total_bytes'],
        'db_bytes' => $database['total_bytes'],
        'percent' => $percent,
        'files' => $files,
        'db' => $database,
        'disk' => $disk,
    ];
}
