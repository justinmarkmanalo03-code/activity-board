<?php

require_once __DIR__ . '/app/functions.php';

if (current_user()) {
    redirect(app_url('pages/dashboard.php'));
}

redirect(app_url('auth/login.php'));
