# Activity Board

A self-hosted team monitoring board built with PHP + MySQL. Features boards, lists, cards, drag-and-drop reordering, file attachments, team presence indicators, and an admin storage monitor.

## Features

- **User accounts** — register, login, logout with session management
- **Boards** — create, rename, delete boards
- **Board members** — share boards with team members (owner / manager / member roles)
- **Lists** — color-coded columns within boards
- **Cards** — tasks with title, description, priority, due date/time, assignees
- **File attachments** — upload files to cards (PDF, images, Office docs, archives)
- **Presence indicators** — see who is online/offline (Facebook-style dots)
- **Tags** — label cards with custom tags
- **Checklists** — add checklist items with progress tracking
- **Activity / comments** — comment thread on each card
- **Admin storage monitor** — live dashboard showing file and database usage

## Requirements

- PHP 7.4+ (8.0+ recommended)
- MySQL / MariaDB
- PHP extensions: `pdo_mysql`, `mbstring`, `gd` (for image handling), `fileinfo`

## Installation

1. **Clone the repo:**
   ```bash
   git clone https://github.com/YOURUSERNAME/activity-board.git
   cd activity-board
   ```

2. **Set up the database:**
   - Create a MySQL database
   - Import `database/schema.sql`:
     ```bash
     mysql -u your_db_user -p your_database_name < database/schema.sql
     ```

3. **Configure credentials:**
   ```bash
   cp app/config.example.php app/config.php
   ```
   Edit `app/config.php` and fill in your real `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASS`.

4. **Upload to web server:**
   - Upload all files to your web root (e.g., `public_html`)
   - Ensure `uploads/` directory is writable (create it if needed)

5. **Visit your site:**
   - First visit goes to `/auth/register.php` to create your admin account
   - After registration, run this SQL to make yourself admin:
     ```sql
     UPDATE users SET is_admin = 1 ORDER BY id ASC LIMIT 1;
     ```

## Project Structure

```
activity-board/
├── index.php              # Redirects to login or dashboard
├── api/
│   ├── index.php          # Main API router (all board/card/list actions)
│   ├── admin.php          # Admin storage monitor endpoint
│   └── attachment.php     # File download endpoint
├── app/
│   ├── config.php         # Database credentials & app constants
│   ├── db.php             # PDO connection & auto-schema migration
│   └── functions.php      # All app logic (auth, boards, cards, etc.)
├── auth/
│   ├── login.php          # Login page
│   ├── register.php       # Registration page
│   └── logout.php         # Logout handler
├── pages/
│   ├── dashboard.php      # Board listing & create board
│   ├── board.php          # Kanban board view (main UI)
│   ├── profile.php        # Avatar upload, password change
│   └── admin.php          # Storage monitor dashboard
├── includes/
│   └── sidebar.php        # Shared sidebar navigation
├── assets/
│   ├── style.css          # Glassmorphism styling
│   ├── board.js           # Board drag-drop, modals, card editing
│   ├── sidebar.js         # Sidebar collapse/toggle
│   ├── presence.js        # Presence ping script
│   └── admin.js           # Admin storage monitor JS
├── database/
│   └── schema.sql         # Complete database schema (single import)
└── uploads/               # User-uploaded files (avatars, attachments)
```

## Security Notes

- **Never commit `app/config.php`** — it contains database credentials. The `.gitignore` already excludes it.
- Use `app/config.example.php` as a template for new deployments.
- All forms use CSRF protection.
- Passwords are hashed with `password_hash()`.

## License

MIT