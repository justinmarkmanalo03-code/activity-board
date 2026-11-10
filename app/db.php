<?php

require_once __DIR__ . '/config.php';

function db(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);

            ensure_schema($pdo);
        } catch (PDOException $e) {
            error_log('Database connection failed: ' . $e->getMessage());
            http_response_code(500);

            $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));

            if (strpos($script, '/api/') !== false) {
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['ok' => false, 'error' => 'Database is temporarily unavailable. Please try again.']);
                exit;
            }

            exit('Database connection failed. Please check config.php.');
        }
    }

    return $pdo;
}

function ensure_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                username VARCHAR(30) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                avatar VARCHAR(255) NULL,
                last_seen DATETIME NULL,
                is_admin TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_users_username (username)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS boards (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                owner_id INT UNSIGNED NOT NULL,
                title VARCHAR(100) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_boards_owner (owner_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS board_members (
                board_id INT UNSIGNED NOT NULL,
                user_id INT UNSIGNED NOT NULL,
                role ENUM('owner', 'manager', 'member') NOT NULL DEFAULT 'member',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (board_id, user_id),
                KEY idx_board_members_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS lists (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                board_id INT UNSIGNED NOT NULL,
                title VARCHAR(100) NOT NULL,
                color CHAR(7) NOT NULL DEFAULT '#ffffff',
                position INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_lists_board (board_id, position)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS cards (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                list_id INT UNSIGNED NOT NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT NULL,
                created_by INT UNSIGNED NULL,
                due_date DATE NULL,
                due_time TIME NULL,
                priority ENUM('none', 'low', 'medium', 'high') NOT NULL DEFAULT 'none',
                position INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_cards_list (list_id, position),
                KEY idx_cards_creator (created_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS card_assignees (
                card_id INT UNSIGNED NOT NULL,
                user_id INT UNSIGNED NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (card_id, user_id),
                KEY idx_card_assignees_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS card_attachments (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                card_id INT UNSIGNED NOT NULL,
                uploaded_by INT UNSIGNED NULL,
                stored_name VARCHAR(255) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                mime_type VARCHAR(120) NULL,
                size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_card_attachments_card (card_id, created_at),
                KEY idx_card_attachments_user (uploaded_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Ensure missing columns exist in existing tables if schema was upgraded
        try {
            $userCols = $pdo->query("SHOW COLUMNS FROM users")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('avatar', $userCols, true)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN avatar VARCHAR(255) NULL");
            }
            if (!in_array('last_seen', $userCols, true)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN last_seen DATETIME NULL");
            }
            if (!in_array('is_admin', $userCols, true)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0");
            }
        } catch (Throwable $e) {}

        try {
            $listCols = $pdo->query("SHOW COLUMNS FROM lists")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('color', $listCols, true)) {
                $pdo->exec("ALTER TABLE lists ADD COLUMN color CHAR(7) NOT NULL DEFAULT '#ffffff'");
            }
        } catch (Throwable $e) {}

        try {
            $cardCols = $pdo->query("SHOW COLUMNS FROM cards")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('due_time', $cardCols, true)) {
                $pdo->exec("ALTER TABLE cards ADD COLUMN due_time TIME NULL");
            }
            if (!in_array('priority', $cardCols, true)) {
                $pdo->exec("ALTER TABLE cards ADD COLUMN priority ENUM('none', 'low', 'medium', 'high') NOT NULL DEFAULT 'none'");
            }
        } catch (Throwable $e) {}

        try {
            $memberCols = $pdo->query("SHOW COLUMNS FROM board_members")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('role', $memberCols, true)) {
                $pdo->exec("ALTER TABLE board_members ADD COLUMN role ENUM('owner', 'manager', 'member') NOT NULL DEFAULT 'member'");
            }
        } catch (Throwable $e) {}
    } catch (Throwable $e) {
        error_log('ensure_schema notice: ' . $e->getMessage());
    }
}
