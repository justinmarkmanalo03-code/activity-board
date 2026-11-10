(() => {
    const config = window.ADMIN_CONFIG || { refreshSeconds: 30 };
    const $ = (selector) => document.querySelector(selector);

    function formatBytes(bytes) {
        const value = Number(bytes);

        if (!value || value <= 0) {
            return '0 B';
        }

        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let index = 0;
        let size = value;

        while (size >= 1024 && index < units.length - 1) {
            size /= 1024;
            index++;
        }

        const rounded = index === 0 ? Math.round(size) : Number(size.toFixed(size >= 100 ? 0 : 1));

        return `${rounded} ${units[index]}`;
    }

    function statusFor(percent) {
        if (percent === null || percent === undefined) {
            return { label: 'Limit not set', cls: 'status-unknown' };
        }

        if (percent >= 90) {
            return { label: 'Critical', cls: 'status-critical' };
        }

        if (percent >= 70) {
            return { label: 'Warning', cls: 'status-warning' };
        }

        return { label: 'Healthy', cls: 'status-ok' };
    }

    function emptyRow(tbody, columns, message) {
        tbody.textContent = '';

        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.className = 'empty-cell';
        td.colSpan = columns;
        td.textContent = message;
        tr.appendChild(td);
        tbody.appendChild(tr);
    }

    function fillTable(tbody, rows, columns, buildCells) {
        if (!tbody) {
            return;
        }

        if (!rows || !rows.length) {
            emptyRow(tbody, columns, 'No data yet.');
            return;
        }

        tbody.textContent = '';

        rows.forEach((row) => {
            const tr = document.createElement('tr');
            buildCells(row).forEach((cell) => tr.appendChild(cell));
            tbody.appendChild(tr);
        });
    }

    function cell(text, className) {
        const td = document.createElement('td');

        if (className) {
            td.className = className;
        }

        td.textContent = text;

        return td;
    }

    function render(data) {
        const files = data.files || {};
        const database = data.db || {};
        const disk = data.disk || {};
        const percent = data.percent;

        if ($('#totalUsed')) $('#totalUsed').textContent = formatBytes(data.total_bytes);
        if ($('#totalSub')) $('#totalSub').textContent = `${formatBytes(data.file_bytes)} files + ${formatBytes(data.db_bytes)} database`;
        if ($('#filesUsed')) $('#filesUsed').textContent = formatBytes(data.file_bytes);
        if ($('#fileMeta')) $('#fileMeta').textContent = `${files.count || 0} files`;
        if ($('#dbUsed')) $('#dbUsed').textContent = formatBytes(data.db_bytes);
        if ($('#dbMeta')) $('#dbMeta').textContent = `${database.table_count || 0} tables`;
        if ($('#limitUsed')) $('#limitUsed').textContent = data.limit_bytes ? formatBytes(data.limit_bytes) : 'Not set';

        const clamped = percent === null || percent === undefined ? 0 : Math.min(100, Math.max(0, percent));
        const status = statusFor(percent);

        if ($('#usageFill')) {
            $('#usageFill').style.width = `${clamped.toFixed(1)}%`;
            $('#usageFill').className = `usage-fill ${status.cls}`;
        }

        if ($('#statusPill')) {
            $('#statusPill').textContent = percent === null || percent === undefined
                ? status.label
                : `${status.label} \u00b7 ${percent.toFixed(1)}%`;
            $('#statusPill').className = `status-pill ${status.cls}`;
        }

        if ($('#usageText')) {
            $('#usageText').textContent = data.limit_bytes
                ? `${formatBytes(data.total_bytes)} of ${formatBytes(data.limit_bytes)} used.`
                : 'Set STORAGE_LIMIT_BYTES in config.php to enable the quota bar.';
        }

        if ($('#fileCount')) $('#fileCount').textContent = `${files.count || 0} files`;

        fillTable($('#fileBreakdown'), files.by_top, 2, (row) => [
            cell(row.name, 'cell-name'),
            cell(formatBytes(row.bytes), 'cell-num cell-right'),
        ]);

        if ($('#dbCount')) $('#dbCount').textContent = `${database.table_count || 0} tables`;

        fillTable($('#dbTables'), database.tables, 4, (row) => [
            cell(row.name, 'cell-name'),
            cell(formatBytes(row.data_bytes), 'cell-num cell-right'),
            cell(formatBytes(row.index_bytes), 'cell-num cell-right'),
            cell(String(row.rows_est ?? 0), 'cell-num cell-right'),
        ]);

        fillTable($('#largestFiles'), files.largest, 2, (row) => [
            cell(row.path, 'cell-name cell-path'),
            cell(formatBytes(row.size), 'cell-num cell-right'),
        ]);

        if ($('#diskText')) {
            if (disk.total_bytes === null || disk.total_bytes === undefined) {
                $('#diskText').textContent = 'Server disk information is not available on this host.';
            } else {
                $('#diskText').textContent = `Server: ${formatBytes(disk.used_bytes)} used of ${formatBytes(disk.total_bytes)} (${formatBytes(disk.free_bytes)} free).`;
            }
        }

        if ($('#updatedAt')) {
            $('#updatedAt').textContent = new Date(data.generated_at).toLocaleTimeString();
        }
    }

    async function refresh() {
        try {
            const response = await fetch(config.endpoint, {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
            });

            let payload;

            try {
                payload = await response.json();
            } catch (error) {
                throw new Error('Unexpected server response.');
            }

            if (!response.ok || !payload.ok) {
                throw new Error(payload.error || 'Request failed.');
            }

            render(payload);

            if ($('#liveDot')) {
                $('#liveDot').classList.remove('is-error');
            }
        } catch (error) {
            if ($('#updatedAt')) {
                $('#updatedAt').textContent = `failed (${error.message})`;
            }

            if ($('#liveDot')) {
                $('#liveDot').classList.add('is-error');
            }
        }
    }

    const seconds = Math.max(5, Number(config.refreshSeconds) || 30);

    if ($('#refreshSecs')) {
        $('#refreshSecs').textContent = String(seconds);
    }

    refresh();
    window.setInterval(refresh, seconds * 1000);
})();
