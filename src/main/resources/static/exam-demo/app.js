const state = {
    token: localStorage.getItem('examDemoToken') || '',
    sessionId: '',
    human: null,
    stream: null,
    recorder: null,
    recordingChunkIndex: 0,
    running: false,
    stopAt: 0,
    timerId: null,
    snapshotTimerId: null,
    lastEventAt: new Map(),
    violationStreaks: new Map(),
};

const FACE_CONFIDENCE_THRESHOLD = 0.78;
const MIN_FACE_AREA_RATIO = 0.018;
const VIOLATION_CONFIRM_FRAMES = 3;
const SNAPSHOT_WINDOW_MS = 3 * 60 * 1000;
const RECORDING_CHUNK_MS = 30 * 1000;

const loginForm = document.getElementById('loginForm');
const sessionSelect = document.getElementById('sessionSelect');
const startExam = document.getElementById('startExam');
const finishExam = document.getElementById('finishExam');
const manualNote = document.getElementById('manualNote');
const timer = document.getElementById('timer');
const statusText = document.getElementById('statusText');
const camera = document.getElementById('camera');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const cameraEmpty = document.getElementById('cameraEmpty');
const faceCount = document.getElementById('faceCount');
const eventCount = document.getElementById('eventCount');
const eventsList = document.getElementById('events');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await login();
});

startExam.addEventListener('click', async () => {
    state.sessionId = sessionSelect.value;
    await start();
});

finishExam.addEventListener('click', () => stop('Exam submitted'));
manualNote.addEventListener('click', () => reportViolation('MANUAL_NOTE', 2, 'Manual proctoring note created by the student demo UI'));

document.addEventListener('visibilitychange', () => {
    if (state.running && document.hidden) {
        reportViolation('TAB_SWITCH', 4, 'The exam tab was hidden or the student switched away from it');
    }
});

window.addEventListener('blur', () => {
    if (state.running) {
        reportViolation('TAB_SWITCH', 3, 'The browser window lost focus during the exam');
    }
});

if (state.token) {
    loadSessions().catch(() => {
        localStorage.removeItem('examDemoToken');
        state.token = '';
        setStatus('Not signed in');
    });
}

async function login() {
    setStatus('Signing in...');
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
        }),
    });

    if (!response.ok) {
        setStatus('Sign in failed');
        return;
    }

    const body = await response.json();
    state.token = body.token;
    localStorage.setItem('examDemoToken', state.token);
    await loadSessions();
}

async function loadSessions() {
    setStatus('Loading sessions...');
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
    startExam.disabled = !state.sessionId;
    setStatus(state.sessionId ? 'Ready' : 'No session assigned');

    if (state.sessionId) {
        await loadEvents();
    }
}

async function start() {
    if (!state.sessionId || state.running) {
        return;
    }

    setStatus('Requesting camera permission...');
    startExam.disabled = true;
    finishExam.disabled = false;
    manualNote.disabled = false;
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
    startRecording();
    state.stopAt = Date.now() + 10 * 60 * 1000;
    state.timerId = setInterval(renderTimer, 1000);
    renderTimer();
    await captureSnapshot('Exam start camera snapshot');
    scheduleNextSnapshot();
    requestAnimationFrame(detectLoop);
    setStatus('Exam in progress');
}

function stop(message) {
    state.running = false;
    state.stopAt = 0;
    clearInterval(state.timerId);
    clearTimeout(state.snapshotTimerId);
    state.timerId = null;
    state.snapshotTimerId = null;
    state.violationStreaks.clear();

    if (state.recorder && state.recorder.state !== 'inactive') {
        state.recorder.stop();
    }
    state.recorder = null;

    if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
        state.stream = null;
    }

    camera.srcObject = null;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    cameraEmpty.hidden = false;
    cameraEmpty.textContent = 'Camera stopped';
    faceCount.textContent = '0';
    timer.textContent = '00:00';
    startExam.disabled = !state.sessionId;
    finishExam.disabled = true;
    manualNote.disabled = true;
    sessionSelect.disabled = false;
    setStatus(message);
}

function startRecording() {
    if (!window.MediaRecorder || !state.stream) {
        reportViolation('MANUAL_NOTE', 2, 'MediaRecorder is not supported by this browser');
        return;
    }

    state.recordingChunkIndex = 0;
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';
    state.recorder = new MediaRecorder(state.stream, { mimeType });
    state.recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
            uploadRecordingChunk(event.data);
        }
    });
    state.recorder.start(RECORDING_CHUNK_MS);
}

async function uploadRecordingChunk(blob) {
    const formData = new FormData();
    formData.append('file', blob, `recording-${String(state.recordingChunkIndex).padStart(6, '0')}.webm`);
    const chunkIndex = state.recordingChunkIndex;
    state.recordingChunkIndex += 1;

    await api(`/api/sessions/${state.sessionId}/recordings/chunks?chunkIndex=${chunkIndex}`, {
        method: 'POST',
        body: formData,
    });
}

function scheduleNextSnapshot() {
    if (!state.running) {
        return;
    }
    const randomDelay = Math.floor(Math.random() * SNAPSHOT_WINDOW_MS);
    state.snapshotTimerId = setTimeout(async () => {
        await captureSnapshot('Random periodic camera snapshot');
        scheduleNextSnapshot();
    }, randomDelay);
}

async function captureSnapshot(reason) {
    if (!state.running || !camera.videoWidth || !camera.videoHeight) {
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = camera.videoWidth;
    canvas.height = camera.videoHeight;
    const snapshotContext = canvas.getContext('2d');
    snapshotContext.translate(canvas.width, 0);
    snapshotContext.scale(-1, 1);
    snapshotContext.drawImage(camera, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) {
        return;
    }

    const formData = new FormData();
    formData.append('file', blob, `snapshot-${Date.now()}.jpg`);
    await api(`/api/sessions/${state.sessionId}/snapshots`, {
        method: 'POST',
        body: formData,
    });
    await reportViolation('MANUAL_NOTE', 1, reason);
}

function renderTimer() {
    const leftMs = Math.max(0, state.stopAt - Date.now());
    const totalSeconds = Math.ceil(leftMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (totalSeconds <= 0) {
        stop('Time is over');
    }
}

async function loadDetector() {
    if (state.human) {
        return;
    }
    if (!window.Human) {
        throw new Error('Face detector failed to load');
    }

    setStatus('Loading face detector...');
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

function filterFaces(faces) {
    const frameArea = Math.max(1, camera.videoWidth * camera.videoHeight);
    return faces.filter((face) => {
        const score = typeof face.score === 'number' ? face.score : 1;
        const [, , width, height] = face.box;
        return score >= FACE_CONFIDENCE_THRESHOLD && (width * height) / frameArea >= MIN_FACE_AREA_RATIO;
    });
}

function drawFaces(faces) {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.lineWidth = 3;
    ctx.font = '14px Arial';

    faces.forEach((face, index) => {
        const [x, y, width, height] = mirrorBox(face.box);
        ctx.strokeStyle = index === 0 ? '#0b7a75' : '#b42318';
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(index === 0 ? 'student' : 'extra face', x + 6, Math.max(18, y - 8));
    });
}

async function evaluateFrame(faces) {
    if (faces.length === 0) {
        await reportConfirmedViolation('FACE_NOT_DETECTED', 4, 'No face detected in the camera frame');
        return;
    }
    if (faces.length > 1) {
        await reportConfirmedViolation('MULTIPLE_FACES', 5, `Multiple faces detected: ${faces.length}`);
        return;
    }

    resetViolation('FACE_NOT_DETECTED');
    resetViolation('MULTIPLE_FACES');

    const [x, y, width, height] = mirrorBox(faces[0].box);
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const centered =
        centerX > overlay.width * 0.25 &&
        centerX < overlay.width * 0.75 &&
        centerY > overlay.height * 0.18 &&
        centerY < overlay.height * 0.82;

    if (!centered) {
        await reportConfirmedViolation('FACE_NOT_CENTERED', 2, 'Face moved outside the central camera zone');
        return;
    }
    resetViolation('FACE_NOT_CENTERED');
}

async function reportConfirmedViolation(type, severity, details) {
    const streak = (state.violationStreaks.get(type) || 0) + 1;
    state.violationStreaks.set(type, streak);
    if (streak >= VIOLATION_CONFIRM_FRAMES) {
        await reportViolation(type, severity, details);
    }
}

function resetViolation(type) {
    state.violationStreaks.delete(type);
}

async function reportViolation(type, severity, details) {
    if (!state.sessionId || !state.token) {
        return;
    }

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

    events.slice(0, 20).forEach((event) => {
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
    statusText.textContent = text;
}
