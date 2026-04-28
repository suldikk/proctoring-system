const state = {
    token: localStorage.getItem('proctoringToken') || '',
    sessionId: '',
    human: null,
    stream: null,
    running: false,
    stopAt: 0,
    timerId: null,
    lastEventAt: new Map(),
    violationStreaks: new Map(),
};

const FACE_CONFIDENCE_THRESHOLD = 0.78;
const MIN_FACE_AREA_RATIO = 0.018;
const VIOLATION_CONFIRM_FRAMES = 3;

const camera = document.getElementById('camera');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const detectorStatus = document.getElementById('detectorStatus');
const cameraEmpty = document.getElementById('cameraEmpty');
const faceCount = document.getElementById('faceCount');
const eventCount = document.getElementById('eventCount');
const currentSession = document.getElementById('currentSession');
const remainingTime = document.getElementById('remainingTime');
const loginForm = document.getElementById('loginForm');
const sessionSelect = document.getElementById('sessionSelect');
const durationMinutes = document.getElementById('durationMinutes');
const startCamera = document.getElementById('startCamera');
const stopCamera = document.getElementById('stopCamera');
const refreshEvents = document.getElementById('refreshEvents');
const eventsList = document.getElementById('events');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await login();
});

startCamera.addEventListener('click', async () => {
    state.sessionId = sessionSelect.value;
    currentSession.textContent = state.sessionId ? shortId(state.sessionId) : '-';
    await start();
});

stopCamera.addEventListener('click', () => stop('Прокторинг остановлен'));

refreshEvents.addEventListener('click', loadEvents);
sessionSelect.addEventListener('change', () => {
    state.sessionId = sessionSelect.value;
    currentSession.textContent = state.sessionId ? shortId(state.sessionId) : '-';
    refreshEvents.disabled = !state.sessionId;
    if (state.sessionId) {
        loadEvents();
    }
});

if (state.token) {
    loadSessions().catch(() => localStorage.removeItem('proctoringToken'));
}

async function login() {
    setStatus('Вход...');
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
        }),
    });

    if (!response.ok) {
        throw new Error('Не удалось войти');
    }

    const body = await response.json();
    state.token = body.token;
    localStorage.setItem('proctoringToken', state.token);
    await loadSessions();
}

async function loadSessions() {
    setStatus('Загрузка сессий...');
    const response = await api('/api/sessions');
    const sessions = await response.json();
    sessionSelect.innerHTML = '';

    sessions.forEach((session) => {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = `${session.examTitle} | ${session.status} | ${shortId(session.id)}`;
        sessionSelect.append(option);
    });

    state.sessionId = sessionSelect.value || '';
    currentSession.textContent = state.sessionId ? shortId(state.sessionId) : '-';
    startCamera.disabled = !state.sessionId;
    refreshEvents.disabled = !state.sessionId;
    setStatus(state.sessionId ? 'Готово' : 'Создайте сессию через API');

    if (state.sessionId) {
        await loadEvents();
    }
}

async function start() {
    if (!state.sessionId) {
        return;
    }
    if (state.running) {
        stop('Прокторинг перезапущен');
    }

    setStatus('Запрос камеры...');
    startCamera.disabled = true;
    stopCamera.disabled = false;
    durationMinutes.disabled = true;
    sessionSelect.disabled = true;
    state.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
    });
    camera.srcObject = state.stream;
    cameraEmpty.hidden = true;

    await new Promise((resolve) => {
        camera.onloadedmetadata = resolve;
    });

    await loadDetector();
    state.running = true;
    startTimer();
    requestAnimationFrame(detectLoop);
}

function stop(message = 'Прокторинг остановлен') {
    state.running = false;
    state.stopAt = 0;
    state.violationStreaks.clear();
    clearInterval(state.timerId);
    state.timerId = null;

    if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
        state.stream = null;
    }

    camera.srcObject = null;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    faceCount.textContent = '0';
    remainingTime.textContent = '-';
    cameraEmpty.hidden = false;
    cameraEmpty.textContent = 'Камера остановлена';
    startCamera.disabled = !state.sessionId;
    stopCamera.disabled = true;
    durationMinutes.disabled = false;
    sessionSelect.disabled = false;
    setStatus(message);
}

function startTimer() {
    const minutes = Number(durationMinutes.value);
    if (minutes <= 0) {
        remainingTime.textContent = 'Без таймера';
        return;
    }

    state.stopAt = Date.now() + minutes * 60 * 1000;
    renderRemainingTime();
    state.timerId = setInterval(() => {
        renderRemainingTime();
        if (Date.now() >= state.stopAt) {
            stop('Время прокторинга истекло');
        }
    }, 1000);
}

function renderRemainingTime() {
    const leftMs = Math.max(0, state.stopAt - Date.now());
    const totalSeconds = Math.ceil(leftMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    remainingTime.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function loadDetector() {
    if (state.human) {
        return;
    }

    if (!window.Human) {
        throw new Error('Библиотека распознавания лица не загрузилась');
    }

    setStatus('Загрузка модели...');
    state.human = new Human.Human({
        modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models',
        backend: 'webgl',
        face: {
            enabled: true,
            detector: { enabled: true, maxDetected: 6, minConfidence: FACE_CONFIDENCE_THRESHOLD },
            mesh: { enabled: false },
            iris: { enabled: false },
            emotion: { enabled: false },
            description: { enabled: false },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
    });
    await state.human.load();
    await state.human.warmup();
    setStatus('Камера активна');
}

async function detectLoop() {
    if (!state.running) {
        return;
    }

    resizeOverlay();
    const result = await state.human.detect(camera);
    const faces = filterFaces(result.face || []);
    drawFaces(faces);
    faceCount.textContent = String(faces.length);
    await evaluateFrame(faces);
    setTimeout(() => requestAnimationFrame(detectLoop), 650);
}

function drawFaces(faces) {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.lineWidth = 3;
    ctx.font = '14px Arial';

    faces.forEach((face, index) => {
        const [x, y, width, height] = mirrorBox(face.box);
        ctx.strokeStyle = index === 0 ? '#2f80ed' : '#c2413f';
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(index === 0 ? 'face' : 'extra', x + 6, Math.max(18, y - 8));
    });
}

function filterFaces(faces) {
    const frameArea = Math.max(1, camera.videoWidth * camera.videoHeight);
    return faces.filter((face) => {
        const score = typeof face.score === 'number' ? face.score : 1;
        const [, , width, height] = face.box;
        const areaRatio = (width * height) / frameArea;
        return score >= FACE_CONFIDENCE_THRESHOLD && areaRatio >= MIN_FACE_AREA_RATIO;
    });
}

async function evaluateFrame(faces) {
    if (faces.length === 0) {
        await reportConfirmedViolation('FACE_NOT_DETECTED', 4, 'Лицо не обнаружено в кадре');
        return;
    }

    if (faces.length > 1) {
        await reportConfirmedViolation('MULTIPLE_FACES', 5, `В кадре обнаружено несколько лиц: ${faces.length}`);
        return;
    }

    resetViolation('FACE_NOT_DETECTED');
    resetViolation('MULTIPLE_FACES');

    const [x, y, width, height] = mirrorBox(faces[0].box);
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const insideCenter =
        centerX > overlay.width * 0.25 &&
        centerX < overlay.width * 0.75 &&
        centerY > overlay.height * 0.18 &&
        centerY < overlay.height * 0.82;

    if (!insideCenter) {
        await reportConfirmedViolation('FACE_NOT_CENTERED', 2, 'Лицо вышло из центральной зоны кадра');
        return;
    }

    resetViolation('FACE_NOT_CENTERED');
}

async function reportConfirmedViolation(type, severity, details) {
    const streak = (state.violationStreaks.get(type) || 0) + 1;
    state.violationStreaks.set(type, streak);
    if (streak < VIOLATION_CONFIRM_FRAMES) {
        return;
    }
    await reportViolation(type, severity, details);
}

function resetViolation(type) {
    state.violationStreaks.delete(type);
}

async function reportViolation(type, severity, details) {
    const now = Date.now();
    const cooldownMs = 6000;
    if ((state.lastEventAt.get(type) || 0) + cooldownMs > now) {
        return;
    }

    state.lastEventAt.set(type, now);
    await api(`/api/sessions/${state.sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, severity, details }),
    });
    await loadEvents();
}

async function loadEvents() {
    if (!state.sessionId) {
        return;
    }

    const response = await api(`/api/sessions/${state.sessionId}/events`);
    const events = await response.json();
    eventCount.textContent = String(events.length);
    eventsList.innerHTML = '';

    events.forEach((event) => {
        const item = document.createElement('li');
        if (event.severity >= 4) {
            item.classList.add('critical');
        }
        item.innerHTML = `
            <div class="event-meta">
                <span>${new Date(event.occurredAt).toLocaleTimeString()}</span>
                <span>severity ${event.severity}</span>
            </div>
            <div class="event-type">${event.type}</div>
            <p class="event-details"></p>
        `;
        item.querySelector('.event-details').textContent = event.details;
        eventsList.append(item);
    });
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

function resizeOverlay() {
    const rect = camera.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (overlay.width !== width || overlay.height !== height) {
        overlay.width = width;
        overlay.height = height;
    }
}

function mirrorBox(box) {
    const scaleX = overlay.width / camera.videoWidth;
    const scaleY = overlay.height / camera.videoHeight;
    const x = overlay.width - (box[0] + box[2]) * scaleX;
    const y = box[1] * scaleY;
    return [x, y, box[2] * scaleX, box[3] * scaleY];
}

function shortId(id) {
    return id ? id.slice(0, 8) : '-';
}

function setStatus(text) {
    detectorStatus.textContent = text;
}
