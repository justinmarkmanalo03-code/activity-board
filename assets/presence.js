(() => {
    const cfg = window.PRESENCE || {};

    if (!cfg.csrf || !cfg.endpoint) {
        return;
    }

    const ping = () => {
        const body = new URLSearchParams();
        body.set('action', 'presence.ping');
        body.set('csrf', cfg.csrf);

        fetch(cfg.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body,
            cache: 'no-store',
            keepalive: true,
        }).catch(() => {
            // Presence is best-effort.
        });
    };

    ping();
    window.setInterval(ping, (Number(cfg.interval) || 15) * 1000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            ping();
        }
    });
    window.addEventListener('focus', ping);
})();
