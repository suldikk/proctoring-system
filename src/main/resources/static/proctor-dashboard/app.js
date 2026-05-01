const state = {
    token: localStorage.getItem('proctorDashboardToken') || '',
    sessions: [],
    selectedSessionId: '',
    refreshTimer: null,
};

const loginForm = document.getElementById('loginForm');
const refreshSessions = document.getElementById('refreshSessions');
const refreshEvents = document.getElementById('refreshEvents');
const refreshSnapshots = document.getElementById('refreshSnapshots');
const refreshRecordings = document.getElementById('refreshRecordings');
const clearArtifacts = document.getElementById('clearArtifacts');
const sessionsList = document.getElementById('sessions');
const eventsList = document.getElementById('events');
const snapshotsList = document.getElementById('snapshots');
const recordingsList = document.getElementById('recordings');
const sessionTitle = document.getElementById('sessionTitle');
const riskBadge = document.getElementById('riskBadge');
const totalEvents = document.getElementById('totalEvents');
const criticalEvents = document.getElementById('criticalEvents');
const lastUpdate = document.getElementById('lastUpdate');
const VISIBLE_EVENT_TYPES = new Set([
    'FULLSCREEN_EXIT',
    'TAB_SWITCH',
    'FACE_NOT_DETECTED',
    'MULTIPLE_FACES',
    'PHONE_DETECTED',
]);

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await login();
});

refreshSessions.addEventListener('click', loadSessions);
refreshEvents.addEventListener('click', loadEvents);
refreshSnapshots.addEventListener('click', loadSnapshots);
refreshRecordings.addEventListener('click', loadRecordings);
clearArtifacts.addEventListener('click', cleanupArtifacts);

if (state.token) {
    loadSessions().catch(() => {
        localStorage.removeItem('proctorDashboardToken');
        state.token = '';
    });
}

async function login() {
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
        }),
    });

    if (!response.ok) {
        renderEmpty('Не удалось войти');
        return;
    }

    const body = await response.json();
    state.token = body.token;
    localStorage.setItem('proctorDashboardToken', state.token);
    await loadSessions();
}

async function loadSessions() {
    const response = await api('/api/sessions');
    state.sessions = await response.json();
    refreshSessions.disabled = false;
    renderSessions();

    if (!state.selectedSessionId && state.sessions.length > 0) {
        selectSession(state.sessions[0].id);
    } else if (state.selectedSessionId) {
        await loadEvents();
    }
}

function renderSessions() {
    sessionsList.innerHTML = '';
    if (state.sessions.length === 0) {
        renderEmpty('Нет назначенных сессий', sessionsList);
        return;
    }

    state.sessions.forEach((session) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'session-item';
        if (session.id === state.selectedSessionId) {
            button.classList.add('active');
        }
        button.innerHTML = `
            <span class="session-title"></span>
            <span class="session-meta">${statusLabel(session.status)} | ${shortId(session.id)}</span>
        `;
        button.querySelector('.session-title').textContent = session.examTitle;
        button.addEventListener('click', () => selectSession(session.id));
        sessionsList.append(button);
    });
}

async function selectSession(sessionId) {
    state.selectedSessionId = sessionId;
    renderSessions();
    const session = state.sessions.find((item) => item.id === sessionId);
    sessionTitle.textContent = session ? session.examTitle : 'Выбранная сессия';
    refreshEvents.disabled = false;
    refreshSnapshots.disabled = false;
    refreshRecordings.disabled = false;
    clearArtifacts.disabled = false;
    await refreshSessionArtifacts();

    clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(refreshSessionArtifacts, 5000);
}

async function loadEvents() {
    if (!state.selectedSessionId) {
        return;
    }

    const response = await api(`/api/sessions/${state.selectedSessionId}/events`);
    const events = await response.json();
    renderEvents(events);
}

async function cleanupArtifacts() {
    if (!state.selectedSessionId) {
        return;
    }

    const confirmed = window.confirm('Очистить нарушения, снимки и фрагменты записи для выбранной сессии?');
    if (!confirmed) {
        return;
    }

    clearArtifacts.disabled = true;
    await api(`/api/sessions/${state.selectedSessionId}/proctoring-artifacts`, {
        method: 'DELETE',
    });
    await refreshSessionArtifacts();
    clearArtifacts.disabled = false;
}

async function refreshSessionArtifacts() {
    await Promise.all([
        loadEvents(),
        loadSnapshots(),
        loadRecordings(),
    ]);
}

function renderEvents(events) {
    const visibleEvents = events.filter((event) => VISIBLE_EVENT_TYPES.has(event.type));
    totalEvents.textContent = String(visibleEvents.length);
    criticalEvents.textContent = String(visibleEvents.filter((event) => event.severity >= 4).length);
    lastUpdate.textContent = new Date().toLocaleTimeString();
    renderRisk(visibleEvents);

    eventsList.innerHTML = '';
    if (visibleEvents.length === 0) {
        renderEmpty('Нарушений пока нет', eventsList);
        return;
    }

    visibleEvents.slice(0, 40).forEach((event) => {
        const item = document.createElement('li');
        if (event.severity >= 4) {
            item.classList.add('critical');
        }
        item.innerHTML = `
            <div class="event-meta">
                <span>${new Date(event.occurredAt).toLocaleString()}</span>
            </div>
            <div class="event-type">${eventTypeLabel(event.type)}</div>
            <p class="event-details"></p>
        `;
        item.querySelector('.event-details').textContent = event.details;
        eventsList.append(item);
    });
}

async function loadSnapshots() {
    if (!state.selectedSessionId) {
        return;
    }

    const response = await api(`/api/sessions/${state.selectedSessionId}/snapshots`);
    const snapshots = await response.json();
    await renderSnapshots(snapshots);
}

async function renderSnapshots(snapshots) {
    snapshotsList.innerHTML = '';
    if (snapshots.length === 0) {
        renderEmpty('Снимки пока не сохранены', snapshotsList);
        return;
    }

    const latest = snapshots.slice(0, 8);
    for (const snapshot of latest) {
        const blobUrl = await authenticatedBlobUrl(`/api/sessions/${state.selectedSessionId}/snapshots/${snapshot.id}/file`);
        const item = document.createElement('div');
        item.className = 'snapshot';
        item.innerHTML = `
            <img alt="Снимок камеры">
            <span>${new Date(snapshot.capturedAt).toLocaleString()} | ${formatBytes(snapshot.sizeBytes)}</span>
        `;
        item.querySelector('img').src = blobUrl;
        snapshotsList.append(item);
    }
}

async function loadRecordings() {
    if (!state.selectedSessionId) {
        return;
    }

    const response = await api(`/api/sessions/${state.selectedSessionId}/recordings/chunks`);
    const chunks = await response.json();
    renderRecordings(chunks);
}

function renderRecordings(chunks) {
    recordingsList.innerHTML = '';
    if (chunks.length === 0) {
        renderEmpty('Фрагменты записи пока не сохранены', recordingsList);
        return;
    }

    chunks.slice(-12).reverse().forEach((chunk) => {
        const item = document.createElement('li');
        item.innerHTML = `
            <div class="event-meta">
                <span>${new Date(chunk.uploadedAt).toLocaleString()}</span>
                <span>фрагмент ${chunk.chunkIndex}</span>
            </div>
            <div class="event-type">${formatBytes(chunk.sizeBytes)}</div>
            <a class="recording-link" href="#">Открыть фрагмент видео</a>
        `;
        item.querySelector('a').addEventListener('click', async (event) => {
            event.preventDefault();
            const blobUrl = await authenticatedBlobUrl(`/api/sessions/${state.selectedSessionId}/recordings/chunks/${chunk.id}/file`);
            window.open(blobUrl, '_blank', 'noopener');
        });
        recordingsList.append(item);
    });
}

function renderRisk(events) {
    riskBadge.className = 'risk';
    const criticalCount = events.filter((event) => event.severity >= 4).length;
    const maxSeverity = events.reduce((max, event) => Math.max(max, event.severity), 0);

    if (criticalCount >= 3 || maxSeverity >= 5) {
        riskBadge.textContent = 'Высокий риск';
        riskBadge.classList.add('high');
    } else if (events.length >= 3 || maxSeverity >= 3) {
        riskBadge.textContent = 'Средний риск';
        riskBadge.classList.add('medium');
    } else if (events.length > 0) {
        riskBadge.textContent = 'Низкий риск';
        riskBadge.classList.add('low');
    } else {
        riskBadge.textContent = 'Нет данных';
    }
}

function renderEmpty(message, target = sessionsList) {
    target.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = message;
    target.append(empty);
}

async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${state.token}`);
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
        throw new Error(`API ${response.status}`);
    }
    return response;
}

async function authenticatedBlobUrl(url) {
    const response = await api(url);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function shortId(id) {
    return id ? id.slice(0, 8) : '-';
}

function statusLabel(status) {
    const labels = {
        CREATED: 'Создана',
        IN_PROGRESS: 'Идёт',
        COMPLETED: 'Завершена',
        CANCELLED: 'Отменена',
    };
    return labels[status] || status;
}

function eventTypeLabel(type) {
    const labels = {
        FACE_NOT_DETECTED: 'Лицо не обнаружено',
        MULTIPLE_FACES: 'Больше одного лица',
        PHONE_DETECTED: 'Телефон в кадре',
        TAB_SWITCH: 'Новая вкладка или потеря фокуса',
        FULLSCREEN_EXIT: 'Выход из полноэкранного режима',
    };
    return labels[type] || type;
}
