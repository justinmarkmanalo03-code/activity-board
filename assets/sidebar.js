(() => {
    const shell = document.getElementById('appShell');
    const collapse = document.getElementById('sidebarCollapse');
    const toggle = document.getElementById('sidebarToggle');

    if (!shell) {
        return;
    }

    const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;

    try {
        if (localStorage.getItem('sidebarCollapsed') === '1') {
            shell.classList.add('sidebar-collapsed');
        }
    } catch (error) {
        // Storage may be unavailable; default to expanded.
    }

    const toggleSidebar = () => {
        if (isNarrow()) {
            shell.classList.toggle('sidebar-open');
            return;
        }

        shell.classList.toggle('sidebar-collapsed');

        try {
            localStorage.setItem('sidebarCollapsed', shell.classList.contains('sidebar-collapsed') ? '1' : '0');
        } catch (error) {
            // Ignore storage failures.
        }
    };

    if (toggle) {
        toggle.addEventListener('click', toggleSidebar);
    }

    if (collapse) {
        collapse.addEventListener('click', toggleSidebar);
    }

    document.addEventListener('click', (event) => {
        if (!isNarrow() || !shell.classList.contains('sidebar-open')) {
            return;
        }

        const sidebar = document.getElementById('appSidebar');

        if (sidebar && sidebar.contains(event.target)) {
            return;
        }

        if (toggle && toggle.contains(event.target)) {
            return;
        }

        shell.classList.remove('sidebar-open');
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            shell.classList.remove('sidebar-open');
        }
    });

    document.querySelectorAll('.app-sidebar a[href^="#"]').forEach((link) => {
        link.addEventListener('click', () => {
            shell.classList.remove('sidebar-open');

            const listView = document.getElementById('listView');

            if (listView && !listView.hidden) {
                const boardTab = document.querySelector('.view-tab[data-view="board"]');

                if (boardTab) {
                    boardTab.click();
                }
            }
        });
    });
})();
