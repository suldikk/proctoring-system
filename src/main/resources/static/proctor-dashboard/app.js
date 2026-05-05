const state = {
    token: localStorage.getItem('proctorDashboardToken') || '',
    sessions: [],
    selectedSessionId: '',
    refreshTimer: null,
    currentEvents: [],
};

const authScreen = document.getElementById('authScreen');
const dashboardLayout = document.getElementById('dashboardLayout');
const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const openExamAccess = document.getElementById('openExamAccess');
const downloadReport = document.getElementById('downloadReport');
const logoutButton = document.getElementById('logoutButton');
const sessionsList = document.getElementById('sessions');
const eventsList = document.getElementById('events');
const snapshotsList = document.getElementById('snapshots');
const identitySnapshot = document.getElementById('identitySnapshot');
const recordingsList = document.getElementById('recordings');
const sessionTitle = document.getElementById('sessionTitle');
const totalEvents = document.getElementById('totalEvents');
const lastUpdate = document.getElementById('lastUpdate');
const VISIBLE_EVENT_TYPES = new Set([
    'FULLSCREEN_EXIT',
    'TAB_SWITCH',
    'FACE_NOT_DETECTED',
    'MULTIPLE_FACES',
    'PHONE_DETECTED',
    'EXAM_FAILED_PHONE',
    'SCREENSHOT_ATTEMPT',
    'COPY_ATTEMPT',
]);

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await login();
});

openExamAccess.addEventListener('click', openAccess);
downloadReport.addEventListener('click', downloadExamReport);
logoutButton.addEventListener('click', logout);

if (state.token) {
    showDashboard();
    loadSessions().catch(() => {
        localStorage.removeItem('proctorDashboardToken');
        state.token = '';
        showAuth('Сессия проктора истекла. Войдите заново.');
    });
} else {
    showAuth('Введите данные проктора, чтобы открыть управление экзаменом.');
}

async function login() {
    loginStatus.textContent = 'Вход в систему...';
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
        }),
    });

    if (!response.ok) {
        loginStatus.textContent = 'Не удалось войти. Проверьте email и пароль.';
        return;
    }

    const body = await response.json();
    state.token = body.token;
    localStorage.setItem('proctorDashboardToken', state.token);
    showDashboard();
    await loadSessions();
}

function showDashboard() {
    authScreen.hidden = true;
    dashboardLayout.hidden = false;
}

function showAuth(message) {
    authScreen.hidden = false;
    dashboardLayout.hidden = true;
    loginStatus.textContent = message;
}

async function logout() {
    clearInterval(state.refreshTimer);
    logoutButton.disabled = true;
    logoutButton.textContent = 'Выход...';
    await closeExamAccess().catch((error) => console.error(error));
    await cleanupAllArtifacts().catch((error) => console.error(error));
    localStorage.removeItem('proctorDashboardToken');
    state.token = '';
    state.sessions = [];
    state.selectedSessionId = '';
    sessionsList.innerHTML = '';
    eventsList.innerHTML = '';
    snapshotsList.innerHTML = '';
    identitySnapshot.innerHTML = '<div class="empty">Снимок появится после проверки камеры</div>';
    recordingsList.innerHTML = '';
    sessionTitle.textContent = 'Сессия не выбрана';
    totalEvents.textContent = '0';
    lastUpdate.textContent = '-';
    state.currentEvents = [];
    updateReportButton();
    showAuth('Вы вышли из аккаунта. Введите данные проктора, чтобы открыть управление экзаменом.');
    logoutButton.disabled = false;
    logoutButton.textContent = 'Выйти';
}

async function closeExamAccess() {
    const activeSessionIds = state.sessions
        .filter((session) => session.status === 'ACTIVE')
        .map((session) => session.id);

    for (const sessionId of activeSessionIds) {
        await api(`/api/sessions/${sessionId}/status/CREATED`, {
            method: 'PATCH',
        });
    }
}

async function cleanupAllArtifacts() {
    const sessionIds = [...new Set(state.sessions.map((session) => session.id))];
    for (const sessionId of sessionIds) {
        await api(`/api/sessions/${sessionId}/proctoring-artifacts`, {
            method: 'DELETE',
        });
    }
}

async function loadSessions() {
    const response = await api('/api/sessions');
    state.sessions = await response.json();
    renderSessions();

    if (!state.selectedSessionId && state.sessions.length > 0) {
        selectSession(state.sessions[0].id);
    } else if (state.selectedSessionId) {
        await selectSession(state.selectedSessionId);
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
    state.currentEvents = [];
    renderSessions();
    const session = state.sessions.find((item) => item.id === sessionId);
    sessionTitle.textContent = session ? session.examTitle : 'Выбранная сессия';
    openExamAccess.disabled = session ? session.status === 'ACTIVE' : true;
    openExamAccess.textContent = session && session.status === 'ACTIVE'
        ? 'Доступ открыт'
        : 'Открыть доступ к экзамену';
    updateReportButton();
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
    state.currentEvents = events;
    renderEvents(events);
    updateReportButton();
}

async function openAccess() {
    if (!state.selectedSessionId) {
        return;
    }

    openExamAccess.disabled = true;
    openExamAccess.textContent = 'Открываем доступ...';
    await api(`/api/sessions/${state.selectedSessionId}/status/ACTIVE`, {
        method: 'PATCH',
    });
    await loadSessions();
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
    lastUpdate.textContent = new Date().toLocaleTimeString();

    eventsList.innerHTML = '';
    if (visibleEvents.length === 0) {
        renderEmpty('Событий пока нет', eventsList);
        return;
    }

    visibleEvents.slice(0, 40).forEach((event) => {
        const item = document.createElement('li');
        item.classList.add('critical');
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
    renderIdentitySnapshot(snapshots);
    const regularSnapshots = snapshots.slice(0, Math.max(0, snapshots.length - 1));

    if (regularSnapshots.length === 0) {
        renderEmpty('Снимки пока не сохранены', snapshotsList);
        return;
    }

    const latest = regularSnapshots.slice(0, 8);
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

async function renderIdentitySnapshot(snapshots) {
    identitySnapshot.innerHTML = '';
    if (snapshots.length === 0) {
        renderEmpty('Снимок появится после проверки камеры', identitySnapshot);
        return;
    }

    const firstSnapshot = snapshots[snapshots.length - 1];
    const blobUrl = await authenticatedBlobUrl(`/api/sessions/${state.selectedSessionId}/snapshots/${firstSnapshot.id}/file`);
    const item = document.createElement('div');
    item.className = 'snapshot identity-card';
    item.innerHTML = `
        <img alt="Контрольный снимок студента">
        <span>${new Date(firstSnapshot.capturedAt).toLocaleString()} | ${formatBytes(firstSnapshot.sizeBytes)}</span>
    `;
    item.querySelector('img').src = blobUrl;
    identitySnapshot.append(item);
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

function updateReportButton() {
    if (!downloadReport) {
        return;
    }
    const hasSubmittedResult = state.currentEvents.some((event) => event.type === 'TEST_SUBMITTED');
    downloadReport.disabled = !state.selectedSessionId || !hasSubmittedResult;
}

function downloadExamReport() {
    const session = state.sessions.find((item) => item.id === state.selectedSessionId);
    if (!session) {
        return;
    }

    const allEvents = [...state.currentEvents].sort((left, right) =>
        new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
    );
    const violationEvents = allEvents.filter((event) => VISIBLE_EVENT_TYPES.has(event.type));
    const resultEvent = [...allEvents].reverse().find((event) => event.type === 'TEST_SUBMITTED');
    const score = resultEvent ? extractScore(resultEvent.details) : 'не указан';
    const violationsByType = violationEvents.reduce((accumulator, event) => {
        const label = eventTypeLabel(event.type);
        accumulator[label] = (accumulator[label] || 0) + 1;
        return accumulator;
    }, {});

    const rows = [
        'ОТЧЕТ ПО ПРОКТОРИНГУ',
        '',
        `Дата формирования: ${new Date().toLocaleString()}`,
        `ФИО студента: Аскаров Султанали`,
        `Группа: ВТ-24б ТиПО`,
        `Дисциплина: Java`,
        `Экзамен: ${session.examTitle}`,
        `ID сессии: ${session.id}`,
        `Статус сессии: ${statusLabel(session.status)}`,
        `Набрано баллов: ${score}`,
        `Количество нарушений: ${violationEvents.length}`,
        '',
        'Нарушения по типам:',
    ];

    if (Object.keys(violationsByType).length === 0) {
        rows.push('Нарушений не зафиксировано.');
    } else {
        Object.entries(violationsByType).forEach(([label, count]) => {
            rows.push(`- ${label}: ${count}`);
        });
    }

    rows.push('', 'Хронология событий:');
    if (allEvents.length === 0) {
        rows.push('Событий нет.');
    } else {
        allEvents.forEach((event) => {
            rows.push(`[${new Date(event.occurredAt).toLocaleString()}] ${eventTypeLabel(event.type)} — ${event.details}`);
        });
    }

    const reportText = rows.join('\n');
    const blob = new Blob(['\ufeff', reportText], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `otchet-proctoring-${shortId(session.id)}.doc`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function extractScore(details) {
    const match = details.match(/(\d+)\s+из\s+100/);
    return match ? `${match[1]} из 100 баллов` : 'не указан';
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
        ACTIVE: 'Доступ открыт',
        IN_PROGRESS: 'Идёт',
        COMPLETED: 'Завершена',
        FLAGGED: 'На проверке',
        CANCELLED: 'Отменена',
    };
    return labels[status] || status;
}

function eventTypeLabel(type) {
    const labels = {
        FACE_NOT_DETECTED: 'Лицо не обнаружено',
        MULTIPLE_FACES: 'Больше одного лица',
        PHONE_DETECTED: 'Телефон в кадре',
        EXAM_FAILED_PHONE: 'Экзамен остановлен и провален',
        TAB_SWITCH: 'Новая вкладка',
        FULLSCREEN_EXIT: 'Выход из полноэкранного режима',
        SCREENSHOT_ATTEMPT: 'Попытка скриншота',
        COPY_ATTEMPT: 'Попытка копирования теста',
    };
    return labels[type] || type;
}
