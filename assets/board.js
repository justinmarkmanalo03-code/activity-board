(() => {
    const BOARD = window.BOARD || { id: 0, csrf: '', cards: {} };
    const cardData = new Map();

    Object.entries(BOARD.cards || {}).forEach(([id, card]) => {
        cardData.set(Number(id), card);
    });

    const $ = (selector, root = document) => root.querySelector(selector);

    const els = {
        boardTitle: $('#boardTitle'),
        boardLists: $('#boardLists'),
        listView: $('#listView'),
        addListForm: $('#addListForm'),
        cardModal: $('#cardModal'),
        cardForm: $('#cardForm'),
        cardTitle: $('#cardTitle'),
        cardDesc: $('#cardDesc'),
        cardDue: $('#cardDue'),
        cardDueTime: $('#cardDueTime'),
        cardAssigned: $('#cardAssigned'),
        cardCreator: $('#cardCreator'),
        cardPriority: $('#cardPriority'),
        cardDelete: $('#cardDelete'),
        cardAttachments: $('#cardAttachments'),
        cardAttachmentInput: $('#cardAttachmentInput'),
        cardAttachmentStatus: $('#cardAttachmentStatus'),
        shareBtn: $('#shareBtn'),
        shareModal: $('#shareModal'),
        shareForm: $('#shareForm'),
        shareUsername: $('#shareUsername'),
        memberList: $('#memberList'),
        renameBoardBtn: $('#renameBoardBtn'),
        deleteBoardBtn: $('#deleteBoardBtn'),
        toast: $('#toast'),
        confirmOverlay: $('#confirmOverlay'),
        confirmTitle: $('#confirmTitle'),
        confirmMessage: $('#confirmMessage'),
        confirmOk: $('#confirmOk'),
        confirmCancel: $('#confirmCancel'),
        confirmClose: $('#confirmClose'),
        promptOverlay: $('#promptOverlay'),
        promptTitle: $('#promptTitle'),
        promptLabel: $('#promptLabel'),
        promptForm: $('#promptForm'),
        promptInput: $('#promptInput'),
        promptColorField: $('#promptColorField'),
        promptColorPalette: $('#promptColorPalette'),
        promptColor: $('#promptColor'),
        promptOk: $('#promptOk'),
        promptCancel: $('#promptCancel'),
        promptClose: $('#promptClose'),
    };

    let currentCardId = null;
    let draggedCard = null;
    let dragMoved = false;
    let suppressClickUntil = 0;
    let toastTimer = null;

    const LIST_COLORS = [
        '#ffffff', '#f1f5f9', '#e2e8f0', '#dbeafe',
        '#e0f2fe', '#ccfbf1', '#dcfce7', '#fef9c3',
        '#ffedd5', '#ffe4e6', '#fae8ff', '#ede9fe',
    ];

    function syncColorSelection(color) {
        if (!els.promptColorPalette) {
            return;
        }

        const normalized = String(color || '').toLowerCase();

        els.promptColorPalette.querySelectorAll('.color-swatch').forEach((swatch) => {
            const selected = swatch.dataset.color.toLowerCase() === normalized;
            swatch.classList.toggle('selected', selected);
            swatch.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    }

    function setPromptColor(color) {
        const value = color || '#ffffff';

        if (els.promptColor) {
            els.promptColor.value = value;
        }

        syncColorSelection(value);
    }

    function buildColorPalette() {
        if (!els.promptColorPalette || els.promptColorPalette.dataset.ready === '1') {
            return;
        }

        LIST_COLORS.forEach((color) => {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'color-swatch';
            swatch.dataset.color = color;
            swatch.style.setProperty('--swatch', color);
            swatch.title = color;
            swatch.setAttribute('aria-label', color);
            swatch.addEventListener('click', () => setPromptColor(color));
            els.promptColorPalette.appendChild(swatch);
        });

        els.promptColorPalette.dataset.ready = '1';

        if (els.promptColor) {
            els.promptColor.addEventListener('input', () => syncColorSelection(els.promptColor.value));
        }
    }

    buildColorPalette();

    function showToast(message) {
        if (!els.toast) {
            return;
        }

        els.toast.textContent = message;
        els.toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            els.toast.hidden = true;
        }, 3200);
    }

    async function api(action, data = {}, options = {}) {
        const body = new URLSearchParams();
        body.set('action', action);
        body.set('csrf', BOARD.csrf);

        Object.entries(data).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                value.forEach((item) => body.append(`${key}[]`, String(item)));
            } else if (value !== null && value !== undefined) {
                body.set(key, String(value));
            }
        });

        const attempts = Math.max(1, Number(options.retries) || 1);
        let lastError = null;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                const response = await fetch(BOARD.api_url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body,
                    cache: 'no-store',
                });

                const text = await response.text();
                let payload = null;

                try {
                    payload = JSON.parse(text);
                } catch (parseError) {
                    const error = new Error(
                        `The server returned an unexpected page (HTTP ${response.status}). Please retry.`
                    );
                    error.retryable = true;
                    throw error;
                }

                if (!response.ok || !payload || !payload.ok) {
                    const error = new Error((payload && payload.error) || `Request failed (HTTP ${response.status}).`);
                    error.retryable = response.status >= 500;
                    throw error;
                }

                return payload;
            } catch (error) {
                if (error.retryable === undefined) {
                    error.retryable = true;
                }

                lastError = error;

                if (!error.retryable || attempt >= attempts) {
                    throw error;
                }

                await new Promise((resolve) => window.setTimeout(resolve, 600 * attempt));
            }
        }

        throw lastError || new Error('Request failed.');
    }

    function showModal(modal) {
        if (!modal) {
            return;
        }

        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modal) {
        if (!modal) {
            return;
        }

        modal.hidden = true;

        if (!document.querySelector('.modal:not([hidden])')) {
            document.body.style.overflow = '';
        }
    }

    function confirmDialog(options = {}) {
        const settings = Object.assign({
            title: 'Are you sure?',
            message: '',
            confirmLabel: 'Delete',
        }, options);

        return new Promise((resolve) => {
            const overlay = els.confirmOverlay;

            if (!overlay) {
                resolve(window.confirm(settings.message || settings.title));
                return;
            }

            els.confirmTitle.textContent = settings.title;
            els.confirmMessage.textContent = settings.message;
            els.confirmOk.textContent = settings.confirmLabel;

            overlay.hidden = false;
            document.body.style.overflow = 'hidden';
            els.confirmCancel.focus();

            function finish(result) {
                overlay.hidden = true;

                if (!document.querySelector('.modal:not([hidden])')) {
                    document.body.style.overflow = '';
                }

                overlay.removeEventListener('click', onOverlayClick);
                document.removeEventListener('keydown', onKey);
                els.confirmOk.removeEventListener('click', onOk);
                els.confirmCancel.removeEventListener('click', onCancel);
                els.confirmClose.removeEventListener('click', onCancel);

                resolve(result);
            }

            function onOverlayClick(event) {
                if (event.target === overlay) {
                    finish(false);
                }
            }

            function onKey(event) {
                if (event.key === 'Escape') {
                    finish(false);
                }
            }

            function onOk() {
                finish(true);
            }

            function onCancel() {
                finish(false);
            }

            overlay.addEventListener('click', onOverlayClick);
            document.addEventListener('keydown', onKey);
            els.confirmOk.addEventListener('click', onOk);
            els.confirmCancel.addEventListener('click', onCancel);
            els.confirmClose.addEventListener('click', onCancel);
        });
    }

    function promptDialog(options = {}) {
        const settings = Object.assign({
            title: 'Rename',
            label: 'Name',
            value: '',
            confirmLabel: 'Save',
            maxLength: 200,
            color: null,
        }, options);

        return new Promise((resolve) => {
            const overlay = els.promptOverlay;

            if (!overlay) {
                const value = window.prompt(settings.title, settings.value);
                resolve(value === null ? null : (settings.color ? { value, color: settings.color } : value));
                return;
            }

            els.promptTitle.textContent = settings.title;
            els.promptLabel.textContent = settings.label;
            els.promptInput.value = settings.value;
            els.promptInput.maxLength = settings.maxLength;
            els.promptOk.textContent = settings.confirmLabel;

            if (els.promptColorField) {
                els.promptColorField.hidden = !settings.color;
            }
            if (settings.color) {
                setPromptColor(settings.color);
            }

            overlay.hidden = false;
            document.body.style.overflow = 'hidden';

            window.setTimeout(() => {
                els.promptInput.focus();
                els.promptInput.select();
            }, 30);

            function finish(result) {
                overlay.hidden = true;

                if (!document.querySelector('.modal:not([hidden])') && !document.querySelector('.confirm-overlay:not([hidden])')) {
                    document.body.style.overflow = '';
                }

                overlay.removeEventListener('click', onOverlayClick);
                document.removeEventListener('keydown', onKey);
                els.promptForm.removeEventListener('submit', onSubmit);
                els.promptCancel.removeEventListener('click', onCancel);
                els.promptClose.removeEventListener('click', onCancel);

                resolve(result);
            }

            function onSubmit(event) {
                event.preventDefault();

                const value = els.promptInput.value.trim();

                if (!value) {
                    els.promptInput.focus();
                    return;
                }

                finish(settings.color ? { value, color: els.promptColor.value } : value);
            }

            function onCancel() {
                finish(null);
            }

            function onOverlayClick(event) {
                if (event.target === overlay) {
                    finish(null);
                }
            }

            function onKey(event) {
                if (event.key === 'Escape') {
                    finish(null);
                }
            }

            overlay.addEventListener('click', onOverlayClick);
            document.addEventListener('keydown', onKey);
            els.promptForm.addEventListener('submit', onSubmit);
            els.promptCancel.addEventListener('click', onCancel);
            els.promptClose.addEventListener('click', onCancel);
        });
    }

    function updateListDeleteButton(listEl) {
        if (!listEl) {
            return;
        }

        const button = listEl.querySelector('[data-list-action="delete"]');

        if (!button) {
            return;
        }

        const hasCards = listEl.querySelectorAll('.list-cards .card').length > 0;
        button.hidden = hasCards;
        button.title = hasCards ? 'Move or delete the cards before deleting this list' : 'Delete list';
    }

    function applyPresence(onlineIds) {
        const online = new Set((onlineIds || []).map(Number));

        document.querySelectorAll('.presence-dot[data-presence-user]').forEach((dot) => {
            const userId = Number(dot.dataset.presenceUser);
            const isOnline = online.has(userId);

            dot.classList.toggle('online', isOnline);
            dot.classList.toggle('offline', !isOnline);
            dot.title = isOnline ? 'Online' : 'Offline';
        });

        document.querySelectorAll('[data-active-user]').forEach((member) => {
            const userId = Number(member.dataset.activeUser);
            const isOnline = online.has(userId);

            member.hidden = !isOnline;
            member.title = isOnline ? `${member.dataset.activeName || 'Board member'} is online` : '';
        });
    }

    async function pingPresence() {
        try {
            const result = await api('presence.ping', { board_id: BOARD.id }, { retries: 0 });
            applyPresence(result.online || []);
        } catch (error) {
            // Presence is best-effort; ignore failures.
        }
    }

    function canDeleteCard(card) {
        if (!card) {
            return false;
        }

        if (card.created_by !== null && card.created_by !== undefined
            && Number(card.created_by) === Number(BOARD.user_id)) {
            return true;
        }

        return Boolean(BOARD.can_manage);
    }

    function formatDate(value) {
        if (!value) {
            return '';
        }

        const parts = String(value).split('-');

        if (parts.length !== 3) {
            return value;
        }

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[Number(parts[1]) - 1];

        return month ? `${month} ${Number(parts[2])}` : value;
    }

    function formatTime(value) {
        if (!value) {
            return '';
        }

        const parts = String(value).split(':');

        if (parts.length < 2) {
            return value;
        }

        let hours = Number(parts[0]);
        const minutes = parts[1];
        const suffix = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;

        return `${hours}:${minutes} ${suffix}`;
    }

    function formatDue(date, time) {
        const day = formatDate(date);

        if (!day) {
            return '';
        }

        const clock = formatTime(time);

        return clock ? `${day}, ${clock}` : day;
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes <= 0) {
            return '0 B';
        }

        const units = ['B', 'KB', 'MB', 'GB'];
        const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / (1024 ** power);

        return `${power === 0 ? Math.round(value) : value.toFixed(1)} ${units[power]}`;
    }

    function attachmentCanDelete(attachment) {
        if (BOARD.can_manage) {
            return true;
        }

        return attachment.uploaded_by != null && Number(attachment.uploaded_by) === Number(BOARD.user_id);
    }

    function renderAttachments(card) {
        if (!els.cardAttachments) {
            return;
        }

        els.cardAttachments.textContent = '';

        const files = Array.isArray(card.attachments) ? card.attachments : [];

        if (!files.length) {
            const empty = document.createElement('li');
            empty.className = 'attachment-empty muted small';
            empty.textContent = 'No files attached yet.';
            els.cardAttachments.appendChild(empty);
            return;
        }

        files.forEach((file) => {
            const item = document.createElement('li');
            item.className = 'attachment-item';

            const link = document.createElement('a');
            link.className = 'attachment-link';
            link.href = file.url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.title = `Download ${file.name}`;

            const name = document.createElement('span');
            name.className = 'attachment-name';
            name.textContent = file.name;

            const meta = document.createElement('span');
            meta.className = 'attachment-meta';
            meta.textContent = [file.size_label, file.uploader_name ? `@${file.uploader_name}` : '']
                .filter(Boolean)
                .join(' \u00b7 ');

            link.appendChild(name);
            link.appendChild(meta);
            item.appendChild(link);

            if (attachmentCanDelete(file)) {
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'icon-btn attachment-remove';
                remove.dataset.attachmentDelete = String(file.id);
                remove.title = 'Remove file';
                remove.setAttribute('aria-label', `Remove ${file.name}`);
                remove.textContent = '\u00d7';
                item.appendChild(remove);
            }

            els.cardAttachments.appendChild(item);
        });
    }

    function setAttachmentStatus(message, isError = false) {
        if (!els.cardAttachmentStatus) {
            return;
        }

        els.cardAttachmentStatus.hidden = !message;
        els.cardAttachmentStatus.textContent = message || '';
        els.cardAttachmentStatus.classList.toggle('is-error', Boolean(isError) && Boolean(message));
    }

    function renderCardMeta(cardEl, card) {
        let meta = cardEl.querySelector('.card-meta');

        if (!meta) {
            meta = document.createElement('div');
            meta.className = 'card-meta';
            cardEl.appendChild(meta);
        }

        meta.textContent = '';

        if (card.priority && card.priority !== 'none') {
            const badge = document.createElement('span');
            badge.className = `badge priority-${card.priority}`;
            badge.textContent = card.priority.charAt(0).toUpperCase() + card.priority.slice(1);
            meta.appendChild(badge);
        }

        if (Array.isArray(card.assignees)) {
            card.assignees.forEach((assignee) => {
                const badge = document.createElement('span');
                badge.className = 'badge assignee';

                const dot = document.createElement('span');
                dot.className = `presence-dot ${assignee.online ? 'online' : 'offline'}`;
                dot.dataset.presenceUser = String(assignee.id);
                dot.title = assignee.online ? 'Online' : 'Offline';

                badge.appendChild(dot);
                badge.appendChild(document.createTextNode(`@${assignee.username}`));
                meta.appendChild(badge);
            });
        }

        if (card.due_date) {
            const due = document.createElement('span');
            due.className = 'badge due';
            due.textContent = formatDue(card.due_date, card.due_time);
            meta.appendChild(due);
        }

        if (Array.isArray(card.attachments) && card.attachments.length) {
            const files = document.createElement('span');
            files.className = 'badge attachment-count';
            files.textContent = `${card.attachments.length} file${card.attachments.length === 1 ? '' : 's'}`;
            meta.appendChild(files);
        }

        if (!meta.children.length) {
            meta.remove();
        }
    }

    function buildCard(card) {
        const el = document.createElement('article');
        el.className = 'card';
        el.draggable = true;
        el.dataset.cardId = String(card.id);
        el.dataset.priority = card.priority || 'none';

        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = card.title;
        el.appendChild(title);

        renderCardMeta(el, card);

        return el;
    }

    function renderListView() {
        if (!els.listView || !els.boardLists) {
            return;
        }

        const fragment = document.createDocumentFragment();

        els.boardLists.querySelectorAll('.list').forEach((listEl) => {
            const listId = Number(listEl.dataset.listId);
            const titleEl = listEl.querySelector('.list-title');
            const listTitle = titleEl ? titleEl.textContent : 'List';
            const listColor = listEl.dataset.listColor || '#ffffff';
            const cards = Array.from(listEl.querySelectorAll('.list-cards .card'))
                .map((cardEl) => cardData.get(Number(cardEl.dataset.cardId)))
                .filter(Boolean);

            const group = document.createElement('section');
            group.className = 'task-group';

            const head = document.createElement('header');
            head.className = 'task-group-head';

            const dot = document.createElement('span');
            dot.className = 'sidebar-dot';
            dot.style.setProperty('--dot', listColor);
            head.appendChild(dot);

            const name = document.createElement('span');
            name.className = 'task-group-name';
            name.textContent = listTitle;
            head.appendChild(name);

            const count = document.createElement('span');
            count.className = 'task-group-count';
            count.textContent = String(cards.length);
            head.appendChild(count);

            group.appendChild(head);

            const table = document.createElement('table');
            table.className = 'task-table';

            const thead = document.createElement('thead');
            const headRow = document.createElement('tr');

            ['Task', 'Assignee', 'Priority', 'Due date'].forEach((label) => {
                const th = document.createElement('th');
                th.textContent = label;
                headRow.appendChild(th);
            });

            thead.appendChild(headRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');

            if (!cards.length) {
                const row = document.createElement('tr');
                row.className = 'task-empty';
                const cell = document.createElement('td');
                cell.colSpan = 4;
                cell.textContent = 'No tasks in this list yet.';
                row.appendChild(cell);
                tbody.appendChild(row);
            }

            cards.forEach((card) => {
                const row = document.createElement('tr');
                row.className = 'task-row';
                row.dataset.cardId = String(card.id);
                row.tabIndex = 0;

                const titleCell = document.createElement('td');
                titleCell.className = 'task-title';
                titleCell.textContent = card.title || '';
                row.appendChild(titleCell);

                const assigneeCell = document.createElement('td');
                assigneeCell.className = 'task-assignees';

                (card.assignees || []).forEach((assignee) => {
                    const badge = document.createElement('span');
                    badge.className = 'badge assignee';

                    const presence = document.createElement('span');
                    presence.className = `presence-dot ${assignee.online ? 'online' : 'offline'}`;
                    presence.dataset.presenceUser = String(assignee.id);
                    presence.title = assignee.online ? 'Online' : 'Offline';

                    badge.appendChild(presence);
                    badge.appendChild(document.createTextNode(`@${assignee.username}`));
                    assigneeCell.appendChild(badge);
                });

                if (!assigneeCell.children.length) {
                    assigneeCell.textContent = '\u2014';
                }

                row.appendChild(assigneeCell);

                const priorityCell = document.createElement('td');

                if (card.priority && card.priority !== 'none') {
                    const badge = document.createElement('span');
                    badge.className = `badge priority-${card.priority}`;
                    badge.textContent = card.priority.charAt(0).toUpperCase() + card.priority.slice(1);
                    priorityCell.appendChild(badge);
                } else {
                    priorityCell.textContent = '\u2014';
                }

                row.appendChild(priorityCell);

                const dueCell = document.createElement('td');
                dueCell.className = 'task-due';
                dueCell.textContent = card.due_date ? formatDue(card.due_date, card.due_time) : '\u2014';
                row.appendChild(dueCell);

                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            group.appendChild(table);
            fragment.appendChild(group);
        });

        els.listView.textContent = '';

        if (!fragment.childNodes.length) {
            const empty = document.createElement('p');
            empty.className = 'muted';
            empty.textContent = 'This board has no lists yet. Add a list to get started.';
            fragment.appendChild(empty);
        }

        els.listView.appendChild(fragment);
    }

    function maybeRefreshListView() {
        if (els.listView && !els.listView.hidden) {
            renderListView();
        }
    }

    function openCard(cardId) {
        const card = cardData.get(cardId);

        if (!card) {
            return;
        }

        currentCardId = cardId;
        els.cardTitle.value = card.title || '';
        els.cardDesc.value = card.description || '';
        els.cardDue.value = card.due_date || '';

        if (els.cardDueTime) {
            els.cardDueTime.value = card.due_time || '';
        }

        if (els.cardAssigned) {
            const assignedIds = new Set((card.assignees || []).map((assignee) => String(assignee.id)));

            els.cardAssigned.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                input.checked = assignedIds.has(input.value);
            });
        }

        if (els.cardCreator) {
            els.cardCreator.textContent = card.creator_name ? `Created by @${card.creator_name}` : '';
        }

        if (els.cardDelete) {
            els.cardDelete.hidden = !canDeleteCard(card);
        }

        els.cardPriority.value = card.priority || 'none';

        renderAttachments(card);
        setAttachmentStatus('');

        if (els.cardAttachmentInput) {
            els.cardAttachmentInput.value = '';
        }

        updateCardDetailViews();
        showModal(els.cardModal);
        window.setTimeout(() => els.cardTitle.focus(), 50);
    }

    function updateCardDetailViews() {
        const card = cardData.get(currentCardId);
        if (!card) return;

        // 1. Status pill & badge (from list)
        const listEl = document.getElementById('list-' + card.list_id);
        const listTitle = listEl ? (listEl.querySelector('.list-title')?.textContent || 'Task') : 'Task';
        const listColor = listEl ? (listEl.dataset.listColor || '#6366f1') : '#6366f1';
        const cardStatusBadge = document.getElementById('cardStatusBadge');
        const cardStatusPill = document.getElementById('cardStatusPill');
        if (cardStatusBadge) cardStatusBadge.textContent = listTitle;
        if (cardStatusPill) {
            cardStatusPill.textContent = listTitle;
            cardStatusPill.style.background = listColor;
        }

        // 2. Assignees display
        const assigneesDisplay = document.getElementById('assigneesDisplay');
        if (assigneesDisplay && els.cardAssigned) {
            const checkedInputs = Array.from(els.cardAssigned.querySelectorAll('input[type="checkbox"]:checked'));
            if (!checkedInputs.length) {
                assigneesDisplay.innerHTML = '<span class="prop-empty">Empty</span>';
            } else {
                const chipsHtml = checkedInputs.map(input => {
                    const label = input.closest('.assign-chip');
                    const name = label ? label.querySelector('.assign-name')?.textContent || '' : '';
                    const avatarHtml = label ? (label.querySelector('.avatar')?.outerHTML || '') : '';
                    return `<span class="assign-mini-chip">${avatarHtml} <span>${name.replace('(owner)', '').trim()}</span></span>`;
                }).join('');
                assigneesDisplay.innerHTML = chipsHtml;
            }
        }

        // 3. Dates display
        const datesDisplay = document.getElementById('datesDisplay');
        if (datesDisplay && els.cardDue) {
            const dateVal = els.cardDue.value;
            const timeVal = els.cardDueTime ? els.cardDueTime.value : '';
            if (!dateVal) {
                datesDisplay.innerHTML = '<span class="prop-empty">Start &rarr; Due</span>';
            } else {
                let formatted = dateVal;
                try {
                    const d = new Date(dateVal + (timeVal ? 'T' + timeVal : 'T00:00:00'));
                    formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    if (timeVal) {
                        formatted += ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    }
                } catch (e) {}
                datesDisplay.innerHTML = `<strong>${formatted}</strong>`;
            }
        }

        // 4. Priority pill
        if (els.cardPriority) {
            const val = els.cardPriority.value || 'none';
            els.cardPriority.className = 'priority-select-pill priority-' + val;
        }

        // 5. Hide popovers
        const assignPopover = document.getElementById('assignPopover');
        const datesPopover = document.getElementById('datesPopover');
        if (assignPopover) assignPopover.hidden = true;
        if (datesPopover) datesPopover.hidden = true;
    }

    const assigneesTrigger = document.getElementById('assigneesTrigger');
    const assignPopover = document.getElementById('assignPopover');
    if (assigneesTrigger && assignPopover) {
        assigneesTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            assignPopover.hidden = !assignPopover.hidden;
        });
        assignPopover.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    if (els.cardAssigned) {
        els.cardAssigned.addEventListener('change', () => {
            updateCardDetailViews();
        });
    }

    const datesTrigger = document.getElementById('datesTrigger');
    const datesPopover = document.getElementById('datesPopover');
    if (datesTrigger && datesPopover) {
        datesTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            datesPopover.hidden = !datesPopover.hidden;
        });
        datesPopover.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    if (els.cardDue) {
        els.cardDue.addEventListener('change', () => updateCardDetailViews());
    }
    if (els.cardDueTime) {
        els.cardDueTime.addEventListener('change', () => updateCardDetailViews());
    }

    const clearDateBtn = document.getElementById('clearDateBtn');
    if (clearDateBtn) {
        clearDateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (els.cardDue) els.cardDue.value = '';
            if (els.cardDueTime) els.cardDueTime.value = '';
            updateCardDetailViews();
            if (datesPopover) datesPopover.hidden = true;
        });
    }

    if (els.cardPriority) {
        els.cardPriority.addEventListener('change', () => {
            updateCardDetailViews();
        });
    }

    document.addEventListener('click', () => {
        if (assignPopover && !assignPopover.hidden) assignPopover.hidden = true;
        if (datesPopover && !datesPopover.hidden) datesPopover.hidden = true;
    });

    document.addEventListener('click', (event) => {
        const closer = event.target.closest('[data-close]');

        if (closer) {
            closeModal(closer.closest('.modal'));
            return;
        }

        if (event.target.classList.contains('modal')) {
            closeModal(event.target);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            document.querySelectorAll('.modal:not([hidden])').forEach((modal) => closeModal(modal));
        }
    });

    document.addEventListener('click', (event) => {
        const cardEl = event.target.closest('.card');

        if (!cardEl || Date.now() < suppressClickUntil) {
            return;
        }

        openCard(Number(cardEl.dataset.cardId));
    });

    els.cardForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!currentCardId) {
            return;
        }

        const title = els.cardTitle.value.trim();

        if (!title) {
            showToast('Card title is required.');
            return;
        }

        const assignedTo = els.cardAssigned
            ? Array.from(els.cardAssigned.querySelectorAll('input[type="checkbox"]:checked')).map((input) => Number(input.value))
            : [];

        try {
            const result = await api('card.update', {
                card_id: currentCardId,
                title,
                description: els.cardDesc.value.trim(),
                due_date: els.cardDue.value,
                due_time: els.cardDueTime ? els.cardDueTime.value : '',
                assigned_to: assignedTo,
                priority: els.cardPriority.value,
            }, { retries: 2 });

            const card = result.card;
            cardData.set(currentCardId, card);

            const cardEl = document.querySelector(`.card[data-card-id="${currentCardId}"]`);

            if (cardEl) {
                cardEl.querySelector('.card-title').textContent = card.title;
                cardEl.dataset.priority = card.priority;
                renderCardMeta(cardEl, card);
            }

            maybeRefreshListView();
            closeModal(els.cardModal);
        } catch (error) {
            showToast(error.message);
        }
    });

    els.cardDelete.addEventListener('click', async () => {
        if (!currentCardId) {
            return;
        }

        const card = cardData.get(currentCardId);

        if (!canDeleteCard(card)) {
            showToast('Only the person who created this card can delete it.');
            return;
        }

        const confirmed = await confirmDialog({
            title: 'Delete card?',
            message: `"${card.title}" will be permanently deleted. This cannot be undone.`,
            confirmLabel: 'Delete card',
        });

        if (!confirmed) {
            return;
        }

        try {
            await api('card.delete', { card_id: currentCardId });

            const cardEl = document.querySelector(`.card[data-card-id="${currentCardId}"]`);
            const listEl = cardEl ? cardEl.closest('.list') : null;

            if (cardEl) {
                cardEl.remove();
            }

            updateListDeleteButton(listEl);
            cardData.delete(currentCardId);
            maybeRefreshListView();
            currentCardId = null;
            closeModal(els.cardModal);
        } catch (error) {
            showToast(error.message);
        }
    });

    async function uploadAttachment(cardId, file) {
        const body = new FormData();
        body.set('action', 'attachment.upload');
        body.set('csrf', BOARD.csrf);
        body.set('card_id', String(cardId));
        body.append('file', file, file.name);

        const response = await fetch(BOARD.api_url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body,
            cache: 'no-store',
        });

        const text = await response.text();
        let payload = null;

        try {
            payload = JSON.parse(text);
        } catch (error) {
            payload = null;
        }

        if (!response.ok || !payload || !payload.ok) {
            throw new Error(payload && payload.error ? payload.error : 'Upload failed.');
        }

        return payload.attachments || [];
    }

    if (els.cardAttachmentInput) {
        els.cardAttachmentInput.addEventListener('change', async () => {
            const input = els.cardAttachmentInput;
            const cardId = currentCardId;
            const card = cardId ? cardData.get(cardId) : null;
            const files = Array.from(input.files || []);

            if (!card || !files.length) {
                input.value = '';
                return;
            }

            const maxBytes = Number(BOARD.attachment_max_bytes) || 0;
            let uploaded = 0;
            input.disabled = true;

            try {
                for (let index = 0; index < files.length; index++) {
                    const file = files[index];

                    if (maxBytes && file.size > maxBytes) {
                        showToast(`${file.name} is larger than ${formatFileSize(maxBytes)}.`);
                        continue;
                    }

                    setAttachmentStatus(`Uploading ${file.name} (${index + 1} of ${files.length})...`);
                    const attachments = await uploadAttachment(cardId, file);
                    card.attachments = attachments;
                    cardData.set(cardId, card);
                    renderAttachments(card);

                    const cardEl = document.querySelector(`.card[data-card-id="${cardId}"]`);

                    if (cardEl) {
                        renderCardMeta(cardEl, card);
                    }

                    maybeRefreshListView();
                    uploaded++;
                }

                if (uploaded) {
                    showToast(uploaded === 1 ? 'File uploaded.' : `${uploaded} files uploaded.`);
                }
            } catch (error) {
                showToast(error.message);
            } finally {
                input.value = '';
                input.disabled = false;
                setAttachmentStatus('');
            }
        });
    }

    if (els.cardAttachments) {
        els.cardAttachments.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-attachment-delete]');

            if (!button || !currentCardId) {
                return;
            }

            event.preventDefault();

            const attachmentId = Number(button.dataset.attachmentDelete);
            const card = cardData.get(currentCardId);
            const attachment = card && Array.isArray(card.attachments)
                ? card.attachments.find((file) => Number(file.id) === attachmentId)
                : null;

            if (!attachment) {
                return;
            }

            const confirmed = await confirmDialog({
                title: 'Remove file?',
                message: `"${attachment.name}" will be permanently deleted.`,
                confirmLabel: 'Remove file',
            });

            if (!confirmed) {
                return;
            }

            button.disabled = true;

            try {
                const result = await api('attachment.delete', { attachment_id: attachmentId });
                card.attachments = result.attachments || [];
                cardData.set(currentCardId, card);
                renderAttachments(card);

                const cardEl = document.querySelector(`.card[data-card-id="${currentCardId}"]`);

                if (cardEl) {
                    renderCardMeta(cardEl, card);
                }

                maybeRefreshListView();
                showToast('File removed.');
            } catch (error) {
                button.disabled = false;
                showToast(error.message);
            }
        });
    }

    document.addEventListener('submit', async (event) => {
        const form = event.target.closest('.add-card-form');

        if (!form) {
            return;
        }

        event.preventDefault();

        const input = form.querySelector('input[name="title"]');
        const title = input.value.trim();

        if (!title) {
            return;
        }

        const listEl = form.closest('.list');

        try {
            const result = await api('card.create', {
                list_id: Number(listEl.dataset.listId),
                title,
            });

            const card = result.card;
            cardData.set(card.id, card);
            listEl.querySelector('.list-cards').appendChild(buildCard(card));
            updateListDeleteButton(listEl);
            maybeRefreshListView();
            input.value = '';
            input.focus();
        } catch (error) {
            showToast(error.message);
        }
    });

    if (els.addListForm) {
        els.addListForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const input = els.addListForm.querySelector('input[name="title"]');
            const title = input.value.trim();

            if (!title) {
                return;
            }

            try {
                await api('list.create', { board_id: BOARD.id, title });
                window.location.reload();
            } catch (error) {
                showToast(error.message);
            }
        });
    }

    document.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-list-action]');

        if (!button) {
            return;
        }

        const listEl = button.closest('.list');
        const listId = Number(listEl.dataset.listId);

        if (button.dataset.listAction === 'rename') {
            const titleEl = listEl.querySelector('.list-title');
            const currentTitle = titleEl.textContent;
            const settings = await promptDialog({
                title: 'Edit list',
                label: 'List name',
                value: currentTitle,
                color: listEl.dataset.listColor || '#ffffff',
                confirmLabel: 'Save',
            });

            if (settings === null) {
                return;
            }

            const title = settings.value.trim();
            const color = settings.color;

            if (!title || (title === currentTitle && color === listEl.dataset.listColor)) {
                return;
            }

            try {
                await api('list.rename', { list_id: listId, title, color });
                titleEl.textContent = title;
                listEl.dataset.listColor = color;
                listEl.style.setProperty('--list-color', color);
            } catch (error) {
                showToast(error.message);
            }
        }

        if (button.dataset.listAction === 'delete') {
            const title = listEl.querySelector('.list-title').textContent;

            const confirmed = await confirmDialog({
                title: 'Delete list?',
                message: `Delete "${title}" and all of its cards? This cannot be undone.`,
                confirmLabel: 'Delete list',
            });

            if (!confirmed) {
                return;
            }

            try {
                await api('list.delete', { list_id: listId });
                listEl.remove();
            } catch (error) {
                showToast(error.message);
            }
        }
    });

    if (els.renameBoardBtn) {
        els.renameBoardBtn.addEventListener('click', async () => {
            const currentTitle = els.boardTitle.textContent;
            const next = await promptDialog({
                title: 'Rename board',
                label: 'Board name',
                value: currentTitle,
                confirmLabel: 'Rename',
            });

            if (next === null) {
                return;
            }

            const title = next.trim();

            if (!title || title === currentTitle) {
                return;
            }

            try {
                await api('board.rename', { board_id: BOARD.id, title });
                els.boardTitle.textContent = title;
            } catch (error) {
                showToast(error.message);
            }
        });
    }

    if (els.deleteBoardBtn) {
        els.deleteBoardBtn.addEventListener('click', async () => {
            const confirmed = await confirmDialog({
                title: 'Delete board?',
                message: 'This board, its lists, and all cards will be permanently deleted. This cannot be undone.',
                confirmLabel: 'Delete board',
            });

            if (!confirmed) {
                return;
            }

            try {
                await api('board.delete', { board_id: BOARD.id });
                window.location.href = BOARD.dashboard_url;
            } catch (error) {
                showToast(error.message);
            }
        });
    }

    if (els.shareBtn && els.shareModal) {
        els.shareBtn.addEventListener('click', () => showModal(els.shareModal));

        els.shareForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const username = els.shareUsername.value.trim();

            if (!username) {
                return;
            }

            try {
                const result = await api('board.share', { board_id: BOARD.id, username });
                appendMember(result.member);
                els.shareUsername.value = '';
                els.shareUsername.focus();
            } catch (error) {
                showToast(error.message);
            }
        });

        els.memberList.addEventListener('click', async (event) => {
            const roleButton = event.target.closest('[data-member-role]');

            if (roleButton) {
                const nextRole = roleButton.dataset.memberRole;
                roleButton.disabled = true;

                try {
                    await api('board.member_role', {
                        board_id: BOARD.id,
                        user_id: Number(roleButton.dataset.userId),
                        role: nextRole,
                    });

                    applyMemberRole(roleButton.closest('li'), nextRole);
                } catch (error) {
                    showToast(error.message);
                } finally {
                    roleButton.disabled = false;
                }

                return;
            }

            const button = event.target.closest('[data-remove-member]');

            if (!button) {
                return;
            }

            const confirmed = await confirmDialog({
                title: 'Remove member?',
                message: 'This person will lose access to the board.',
                confirmLabel: 'Remove',
            });

            if (!confirmed) {
                return;
            }

            try {
                await api('board.unshare', {
                    board_id: BOARD.id,
                    user_id: Number(button.dataset.removeMember),
                });

                const item = button.closest('li');

                if (item) {
                    item.remove();
                }
            } catch (error) {
                showToast(error.message);
            }
        });
    }

    function applyMemberRole(item, role) {
        if (!item) {
            return;
        }

        item.dataset.role = role;

        const badge = item.querySelector('.role-badge');

        if (badge) {
            badge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
            badge.className = `role-badge role-${role}`;
        }

        const toggle = item.querySelector('[data-member-role]');

        if (toggle) {
            const isManager = role === 'manager';
            toggle.dataset.memberRole = isManager ? 'member' : 'manager';
            toggle.classList.toggle('is-active', isManager);
            toggle.textContent = isManager ? 'Revoke power' : 'Give power';
            toggle.title = isManager ? 'Revoke manager power' : 'Give manager power';
        }
    }

    function appendMember(member) {
        if (!els.memberList) {
            return;
        }

        const item = document.createElement('li');
        item.dataset.userId = String(member.id);
        item.dataset.role = member.role || 'member';

        const identity = document.createElement('span');
        identity.className = 'member-identity';

        const avatarWrap = document.createElement('span');
        avatarWrap.className = 'avatar-wrap';

        const avatar = document.createElement('span');
        avatar.className = 'avatar avatar-sm';

        if (member.avatar) {
            const image = document.createElement('img');
            image.src = member.avatar;
            image.alt = member.username;
            image.loading = 'lazy';
            avatar.appendChild(image);
        } else {
            const initials = document.createElement('span');
            initials.className = 'avatar-initials';
            initials.textContent = (member.username || '?').trim().charAt(0).toUpperCase() || '?';
            avatar.appendChild(initials);
        }

        const dot = document.createElement('span');
        dot.className = `presence-dot ${member.online ? 'online' : 'offline'}`;
        dot.dataset.presenceUser = String(member.id);
        dot.title = member.online ? 'Online' : 'Offline';

        const name = document.createElement('span');
        name.className = 'member-name';
        name.textContent = `@${member.username}`;

        avatarWrap.append(avatar, dot);
        identity.append(avatarWrap, name);
        item.appendChild(identity);

        const role = member.role || 'member';
        const roleBadge = document.createElement('span');
        roleBadge.className = `role-badge role-${role}`;
        roleBadge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        item.appendChild(roleBadge);

        if (BOARD.is_owner && role !== 'owner') {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'role-toggle';
            toggle.dataset.memberRole = 'manager';
            toggle.dataset.userId = String(member.id);
            toggle.textContent = 'Give power';
            toggle.title = 'Give manager power';
            item.appendChild(toggle);
        }

        if (role !== 'owner') {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'icon-btn';
            remove.dataset.removeMember = String(member.id);
            remove.textContent = '\u2715';
            item.appendChild(remove);
        }

        els.memberList.appendChild(item);
    }

    function getDragAfterElement(container, y) {
        const elements = Array.from(container.querySelectorAll('.card:not(.dragging)'));

        return elements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            }

            return closest;
        }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
    }

    document.addEventListener('dragstart', (event) => {
        const cardEl = event.target.closest('.card');

        if (!cardEl) {
            return;
        }

        draggedCard = cardEl;
        dragMoved = false;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', cardEl.dataset.cardId);
        window.setTimeout(() => cardEl.classList.add('dragging'), 0);
    });

    document.addEventListener('dragover', (event) => {
        if (!draggedCard) {
            return;
        }

        const container = event.target.closest('.list-cards');

        if (!container) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';

        const after = getDragAfterElement(container, event.clientY);

        if (after) {
            container.insertBefore(draggedCard, after);
        } else {
            container.appendChild(draggedCard);
        }

        dragMoved = true;
    });

    document.addEventListener('dragend', async (event) => {
        const cardEl = event.target.closest('.card');

        if (!cardEl || !draggedCard) {
            return;
        }

        cardEl.classList.remove('dragging');
        draggedCard = null;

        if (!dragMoved) {
            return;
        }

        suppressClickUntil = Date.now() + 300;

        const container = cardEl.closest('.list-cards');

        if (!container) {
            return;
        }

        const targetListId = Number(container.dataset.listId);
        const cardId = Number(cardEl.dataset.cardId);
        const order = Array.from(container.querySelectorAll('.card')).map((el) => Number(el.dataset.cardId));

        try {
            await api('card.move', {
                card_id: cardId,
                to_list_id: targetListId,
                order,
            });

            const card = cardData.get(cardId);

            if (card) {
                card.list_id = targetListId;
            }

            maybeRefreshListView();
            document.querySelectorAll('.list').forEach(updateListDeleteButton);
        } catch (error) {
            showToast(error.message);
            window.setTimeout(() => window.location.reload(), 700);
        }
    });

    document.querySelectorAll('.list').forEach(updateListDeleteButton);

    function setupViewTabs() {
        const tabs = Array.from(document.querySelectorAll('.view-tab[data-view]'));

        if (!tabs.length || !els.listView) {
            return;
        }

        const setView = (view) => {
            const isList = view === 'list';

            if (els.boardLists) {
                els.boardLists.hidden = isList;
            }

            els.listView.hidden = !isList;

            tabs.forEach((tab) => {
                tab.classList.toggle('is-active', tab.dataset.view === view);
            });

            if (isList) {
                renderListView();
            }

            try {
                localStorage.setItem('boardView', view);
            } catch (error) {
                // Ignore storage failures.
            }
        };

        tabs.forEach((tab) => {
            tab.addEventListener('click', () => setView(tab.dataset.view));
        });

        if (els.listView) {
            els.listView.addEventListener('click', (event) => {
                const row = event.target.closest('.task-row');

                if (row) {
                    openCard(Number(row.dataset.cardId));
                }
            });

            els.listView.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                const row = event.target.closest('.task-row');

                if (!row) {
                    return;
                }

                event.preventDefault();
                openCard(Number(row.dataset.cardId));
            });
        }

        let saved = 'board';

        try {
            saved = localStorage.getItem('boardView') === 'list' ? 'list' : 'board';
        } catch (error) {
            // Default to the board view.
        }

        setView(saved);
    }

    setupViewTabs();

    pingPresence();
    window.setInterval(pingPresence, (Number(BOARD.presence_ping) || 15) * 1000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            pingPresence();
        }
    });
    window.addEventListener('focus', pingPresence);

    /* ---------- Team monitoring: tags, checklist, comments ---------- */
    const tagInput = document.getElementById('tagInput');
    const tagRow = document.getElementById('tagRow');
    const checklistInput = document.getElementById('checklistInput');
    const checklistAdd = document.getElementById('checklistAdd');
    const checklistItems = document.getElementById('checklistItems');
    const checklistProgress = document.getElementById('checklistProgress');
    const checklistBar = document.getElementById('checklistBar');
    const commentInput = document.getElementById('commentInput');
    const commentAdd = document.getElementById('commentAdd');
    const activityList = document.getElementById('activityList');

    function ensureCardArrays(card) {
        if (!card.tags) card.tags = [];
        if (!card.checklist) card.checklist = [];
        if (!card.comments) card.comments = [];
    }

    function renderTags() {
        const card = cardData.get(currentCardId);
        if (!card) return;
        ensureCardArrays(card);

        const existing = tagRow.querySelector('.tag-chip');
        tagRow.querySelectorAll('.tag-chip').forEach((chip) => chip.remove());

        card.tags.forEach((tag, index) => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.innerHTML = escapeHtml(tag) + ' <span class="tag-remove" title="Remove">&#10005;</span>';
            chip.querySelector('.tag-remove').addEventListener('click', () => {
                card.tags.splice(index, 1);
                renderTags();
            });
            tagRow.insertBefore(chip, tagRow.querySelector('.tag-add-form'));
        });
    }

    function renderChecklist() {
        const card = cardData.get(currentCardId);
        if (!card) return;
        ensureCardArrays(card);

        checklistItems.textContent = '';
        let done = 0;
        card.checklist.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'checklist-item' + (item.done ? ' done' : '');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = Boolean(item.done);
            cb.addEventListener('change', () => {
                item.done = cb.checked;
                renderChecklist();
            });
            const label = document.createElement('span');
            label.className = 'check-label';
            label.textContent = item.text;
            row.append(cb, label);
            checklistItems.appendChild(row);
            if (item.done) done++;
        });

        const total = card.checklist.length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        checklistProgress.textContent = `${done} / ${total}`;
        checklistBar.style.width = pct + '%';
    }

    function renderActivity() {
        const card = cardData.get(currentCardId);
        if (!card) return;
        ensureCardArrays(card);

        activityList.textContent = '';
        const comments = card.comments || [];
        if (!comments.length) {
            const empty = document.createElement('div');
            empty.className = 'activity-empty';
            empty.textContent = 'No activity yet.';
            activityList.appendChild(empty);
            return;
        }

        comments.forEach((entry) => {
            const item = document.createElement('div');
            item.className = 'activity-item';

            const avatar = document.createElement('div');
            avatar.className = 'activity-avatar';
            if (entry.avatar) {
                const img = document.createElement('img');
                img.src = entry.avatar;
                img.alt = entry.username;
                avatar.appendChild(img);
            } else {
                avatar.textContent = (entry.username || '?').charAt(0).toUpperCase();
            }

            const body = document.createElement('div');
            body.className = 'activity-body';
            body.innerHTML = '<strong>@' + escapeHtml(entry.username) + '</strong> ' + escapeHtml(entry.text) +
                ' <span class="activity-time">' + escapeHtml(entry.time || '') + '</span>';

            item.append(avatar, body);
            activityList.appendChild(item);
        });
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    if (tagInput) {
        tagInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const value = tagInput.value.trim();
                if (!value) return;
                const card = cardData.get(currentCardId);
                if (card) {
                    ensureCardArrays(card);
                    card.tags.push(value);
                    tagInput.value = '';
                    renderTags();
                }
            }
        });
    }

    if (checklistAdd && checklistInput) {
        checklistAdd.addEventListener('click', () => {
            const value = checklistInput.value.trim();
            if (!value) return;
            const card = cardData.get(currentCardId);
            if (card) {
                ensureCardArrays(card);
                card.checklist.push({ text: value, done: false });
                checklistInput.value = '';
                renderChecklist();
            }
        });
        checklistInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                checklistAdd.click();
            }
        });
    }

    if (commentAdd && commentInput) {
        commentAdd.addEventListener('click', () => {
            const value = commentInput.value.trim();
            if (!value) return;
            const card = cardData.get(currentCardId);
            if (card) {
                ensureCardArrays(card);
                card.comments.push({
                    username: BOARD.current_username || 'You',
                    avatar: BOARD.current_avatar || null,
                    text: value,
                    time: 'Just now',
                });
                commentInput.value = '';
                renderActivity();
            }
        });
        commentInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                commentAdd.click();
            }
        });
    }

    const origOpenCard = openCard;
    openCard = function (cardId) {
        origOpenCard(cardId);
        renderTags();
        renderChecklist();
        renderActivity();
    };
})();
