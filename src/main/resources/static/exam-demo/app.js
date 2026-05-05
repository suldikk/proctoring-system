const state = {
    token: localStorage.getItem('examDemoToken') || '',
    sessionId: '',
    human: null,
    stream: null,
    mediaCheckStream: null,
    recorder: null,
    recordingChunkIndex: 0,
    running: false,
    extensionReady: false,
    extensionTimerId: null,
    stopAt: 0,
    timerId: null,
    snapshotTimerId: null,
    recordingTimerId: null,
    fiveMinuteWarningShown: false,
    fullscreenBlocked: false,
    examFailed: false,
    lastEventAt: new Map(),
    violationStreaks: new Map(),
};

const FACE_CONFIDENCE_THRESHOLD = 0.78;
const MIN_FACE_AREA_RATIO = 0.018;
const MEDIA_CHECK_FACE_CONFIDENCE_THRESHOLD = 0.45;
const MEDIA_CHECK_MIN_FACE_AREA_RATIO = 0.003;
const VIOLATION_CONFIRM_FRAMES = 3;
const MEDIA_INTERVAL_MS = 5 * 60 * 1000;
const RECORDING_DURATION_MS = 10 * 1000;
const EXAM_DURATION_MS = 30 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const PHONE_LABELS = ['cell phone', 'mobile phone', 'phone', 'smartphone'];
const DEMO_STUDENTS_BY_IIN = {
    '010101300123': 'student@example.com',
};

const authScreen = document.getElementById('authScreen');
const accessToast = document.getElementById('accessToast');
const mediaCheckScreen = document.getElementById('mediaCheckScreen');
const extensionScreen = document.getElementById('extensionScreen');
const examLayout = document.getElementById('examLayout');
const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const languageSelect = document.getElementById('languageSelect');
const mediaCheckStatus = document.getElementById('mediaCheckStatus');
const mediaCheckVideo = document.getElementById('mediaCheckVideo');
const mediaCheckOverlay = document.getElementById('mediaCheckOverlay');
const mediaCheckCtx = mediaCheckOverlay.getContext('2d');
const mediaCheckEmpty = document.getElementById('mediaCheckEmpty');
const identitySnapshotButton = document.getElementById('identitySnapshotButton');
const extensionGateStatus = document.getElementById('extensionGateStatus');
const extensionCheckButton = document.getElementById('extensionCheckButton');
const sessionSelect = document.getElementById('sessionSelect');
const finishExam = document.getElementById('finishExam');
const logoutButton = document.getElementById('logoutButton');
const timer = document.getElementById('timer');
const statusText = document.getElementById('statusText');
const extensionState = document.getElementById('extensionState');
const timeWarning = document.getElementById('timeWarning');
const examResult = document.getElementById('examResult');
const fullscreenWarning = document.getElementById('fullscreenWarning');
const screenshotWarning = document.getElementById('screenshotWarning');
const examFailedWarning = document.getElementById('examFailedWarning');
const faceMissingWarning = document.getElementById('faceMissingWarning');
const multipleFacesWarning = document.getElementById('multipleFacesWarning');
const failedLogoutButton = document.getElementById('failedLogoutButton');
const returnFullscreen = document.getElementById('returnFullscreen');
const camera = document.getElementById('camera');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const cameraEmpty = document.getElementById('cameraEmpty');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await login();
});

languageSelect.addEventListener('change', () => {
    if (languageSelect.value === 'kk') {
        loginStatus.textContent = 'Казахский интерфейс будет добавлен позже. Сейчас используется русский язык.';
        return;
    }
    loginStatus.textContent = 'Введите ИИН студента и пароль, чтобы перейти к экзамену.';
});

finishExam.addEventListener('click', submitExam);
logoutButton.addEventListener('click', logout);
failedLogoutButton.addEventListener('click', logout);
extensionCheckButton.addEventListener('click', checkExtensionAndEnterExam);
identitySnapshotButton.addEventListener('click', captureIdentitySnapshot);
returnFullscreen.addEventListener('click', () => enterFullscreen());

document.addEventListener('fullscreenchange', () => {
    if (!state.running) {
        return;
    }
    if (!document.fullscreenElement) {
        state.fullscreenBlocked = true;
        fullscreenWarning.hidden = false;
        reportViolation('FULLSCREEN_EXIT', 5, 'Студент вышел из полноэкранного режима');
    } else if (state.fullscreenBlocked) {
        state.fullscreenBlocked = false;
        fullscreenWarning.hidden = true;
        reportViolation('FULLSCREEN_RETURNED', 1, 'Студент вернулся в полноэкранный режим');
    }
});

document.addEventListener('visibilitychange', () => {
    if (state.running && document.hidden) {
        reportViolation('TAB_SWITCH', 5, 'Студент открыл новую вкладку');
    }
});

window.addEventListener('blur', () => {
    if (state.running) {
        reportViolation('TAB_SWITCH', 5, 'Студент открыл новую вкладку');
    }
});

document.addEventListener('keydown', (event) => {
    if (!state.running) {
        return;
    }
    if (event.key === 'PrintScreen') {
        event.preventDefault();
        blockScreenshotAttempt();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        blockScreenshotAttempt();
    }
});

window.addEventListener('beforeprint', (event) => {
    if (!state.running) {
        return;
    }
    event.preventDefault();
    blockScreenshotAttempt();
});

document.querySelector('.questions').addEventListener('copy', blockCopyAttempt);
document.querySelector('.questions').addEventListener('cut', blockCopyAttempt);
document.querySelector('.questions').addEventListener('contextmenu', blockCopyAttempt);

window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) {
        return;
    }
    if (event.data.type === 'PROCTORING_EXTENSION_READY') {
        const firstConnect = !state.extensionReady;
        state.extensionReady = true;
        renderExtensionState();
        if (state.running && firstConnect) {
            reportViolation('EXTENSION_CONNECTED', 1, 'Расширение прокторинга активно');
        }
    }
});

restartExtensionPolling();
initializeScreen();

async function login() {
    const iin = document.getElementById('iin').value.trim();
    const email = DEMO_STUDENTS_BY_IIN[iin];

    if (!email) {
        loginStatus.textContent = 'Студент с таким ИИН не найден.';
        return;
    }

    loginStatus.textContent = 'Вход в систему...';
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email,
            password: document.getElementById('password').value,
        }),
    });

    if (!response.ok) {
        loginStatus.textContent = 'Не удалось войти. Проверьте ИИН и пароль.';
        return;
    }

    const body = await response.json();
    state.token = body.token;

    const hasAccess = await loadActiveSession();
    if (!hasAccess) {
        localStorage.removeItem('examDemoToken');
        state.token = '';
        showAuthScreen('Введите ИИН студента и пароль, чтобы перейти к экзамену.');
        showAccessToast('Доступ к экзамену закрыт');
        return;
    }

    localStorage.setItem('examDemoToken', state.token);
    await showMediaCheckScreen();
}

async function loadSessions() {
    setStatus('Загрузка сессий...');
    const response = await api('/api/sessions');
    const sessions = (await response.json()).filter((session) => session.status === 'ACTIVE');
    sessionSelect.innerHTML = '';

    sessions.forEach((session) => {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = `${session.examTitle} | ${statusLabel(session.status)} | ${shortId(session.id)}`;
        sessionSelect.append(option);
    });

    state.sessionId = sessionSelect.value || '';
    if (!state.sessionId) {
        setStatus('Нет назначенной сессии');
        return;
    }
    await start();
}

function showExamScreen() {
    stopMediaCheckStream();
    authScreen.hidden = true;
    mediaCheckScreen.hidden = true;
    extensionScreen.hidden = true;
    examLayout.hidden = false;
    loadSessions().catch((error) => {
        console.error(error);
        localStorage.removeItem('examDemoToken');
        state.token = '';
        showAuthScreen('Не удалось загрузить экзамен. Войдите заново.');
    });
}

function showAuthScreen(message) {
    stopMediaCheckStream();
    authScreen.hidden = false;
    mediaCheckScreen.hidden = true;
    extensionScreen.hidden = true;
    examLayout.hidden = true;
    loginStatus.textContent = message;
}

async function showMediaCheckScreen() {
    stopMediaCheckStream();
    authScreen.hidden = true;
    mediaCheckScreen.hidden = false;
    extensionScreen.hidden = true;
    examLayout.hidden = true;
    identitySnapshotButton.disabled = true;
    mediaCheckEmpty.hidden = false;
    mediaCheckEmpty.textContent = 'Ожидаем доступ к камере';
    mediaCheckCtx.clearRect(0, 0, mediaCheckOverlay.width, mediaCheckOverlay.height);
    mediaCheckStatus.textContent = 'Запрашиваем доступ к камере и микрофону...';

    try {
        state.mediaCheckStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: true,
        });
        mediaCheckVideo.srcObject = state.mediaCheckStream;
        await mediaCheckVideo.play();
        mediaCheckEmpty.hidden = true;
        identitySnapshotButton.disabled = false;
        mediaCheckStatus.textContent = 'Камера и микрофон работают. Посмотрите в камеру и нажмите «Сделать снимок».';
    } catch (error) {
        console.error(error);
        mediaCheckStatus.textContent = 'Ошибка: камера или микрофон не работают либо доступ не разрешён.';
    }
}

function showExtensionScreen() {
    stopMediaCheckStream();
    authScreen.hidden = true;
    mediaCheckScreen.hidden = true;
    extensionScreen.hidden = false;
    examLayout.hidden = true;
    extensionGateStatus.textContent = 'После запуска расширения нажмите кнопку ниже. Если расширение отвечает, экзамен откроется автоматически.';
    extensionCheckButton.disabled = false;
    extensionCheckButton.textContent = 'Я запустил расширение';
    pingExtension();
}

function stopMediaCheckStream() {
    if (state.mediaCheckStream) {
        state.mediaCheckStream.getTracks().forEach((track) => track.stop());
        state.mediaCheckStream = null;
    }
    if (mediaCheckVideo) {
        mediaCheckVideo.srcObject = null;
    }
}

async function initializeScreen() {
    if (state.token) {
        const hasAccess = await loadActiveSession().catch(() => false);
        if (!hasAccess) {
            localStorage.removeItem('examDemoToken');
            state.token = '';
            showAuthScreen('Введите ИИН студента и пароль, чтобы перейти к экзамену.');
            return;
        }
        await showMediaCheckScreen();
        return;
    }
    showAuthScreen('Введите ИИН студента и пароль, чтобы перейти к экзамену.');
}

function logout() {
    if (state.running) {
        stop('Вы вышли из аккаунта');
    }
    localStorage.removeItem('examDemoToken');
    state.token = '';
    state.sessionId = '';
    sessionSelect.innerHTML = '';
    showAuthScreen('Вы вышли из аккаунта. Введите ИИН студента и пароль, чтобы перейти к экзамену.');
}

async function start() {
    if (!state.sessionId || state.running || !state.extensionReady) {
        return;
    }

    setStatus('Запрос доступа к камере и микрофону...');
    await enterFullscreen();
    finishExam.disabled = false;
    sessionSelect.disabled = true;

    state.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true,
    });
    camera.srcObject = state.stream;
    cameraEmpty.hidden = true;

    state.stream.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', () => reportViolation('MICROPHONE_DISABLED', 4, 'Микрофон был отключён во время экзамена'));
        track.addEventListener('mute', () => reportViolation('MICROPHONE_DISABLED', 4, 'Микрофон был заглушен во время экзамена'));
    });
    state.stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => reportViolation('CAMERA_DISABLED', 5, 'Камера была отключена во время экзамена'));
    });

    await new Promise((resolve) => {
        camera.onloadedmetadata = resolve;
    });

    await loadDetector();
    state.running = true;
    state.examFailed = false;
    state.stopAt = Date.now() + EXAM_DURATION_MS;
    state.fiveMinuteWarningShown = false;
    state.timerId = setInterval(renderTimer, 1000);
    renderTimer();
    await reportViolation('EXTENSION_CONNECTED', 1, 'Расширение прокторинга активно при старте экзамена');
    await captureSnapshot('Плановый снимок камеры при старте экзамена');
    await recordTenSecondClip();
    scheduleSnapshotCapture();
    requestAnimationFrame(detectLoop);
    setStatus('Экзамен идёт');
}

async function ensureExamAccess() {
    return loadActiveSession();
}

async function loadActiveSession() {
    const response = await api('/api/sessions');
    const sessions = (await response.json()).filter((session) => session.status === 'ACTIVE');
    sessionSelect.innerHTML = '';
    sessions.forEach((session) => {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = `${session.examTitle} | ${statusLabel(session.status)} | ${shortId(session.id)}`;
        sessionSelect.append(option);
    });
    state.sessionId = sessionSelect.value || '';
    return Boolean(state.sessionId);
}

async function uploadIdentitySnapshot(stream) {
    if (!state.sessionId) {
        throw new Error('Нет активной экзаменационной сессии');
    }

    const preview = document.createElement('video');
    preview.muted = true;
    preview.playsInline = true;
    preview.srcObject = stream;
    await preview.play();
    await new Promise((resolve) => {
        if (preview.videoWidth > 0) {
            resolve();
            return;
        }
        preview.onloadedmetadata = resolve;
    });

    const canvas = document.createElement('canvas');
    canvas.width = preview.videoWidth || 1280;
    canvas.height = preview.videoHeight || 720;
    const snapshotContext = canvas.getContext('2d');
    snapshotContext.translate(canvas.width, 0);
    snapshotContext.scale(-1, 1);
    snapshotContext.drawImage(preview, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) {
        throw new Error('Не удалось сделать контрольный снимок');
    }

    const formData = new FormData();
    formData.append('file', blob, `identity-${Date.now()}.jpg`);
    await api(`/api/sessions/${state.sessionId}/snapshots`, {
        method: 'POST',
        body: formData,
    });
    await reportViolation('MANUAL_NOTE', 1, 'Контрольный снимок студента перед началом экзамена');
}

async function captureIdentitySnapshot() {
    if (!state.mediaCheckStream || !mediaCheckVideo.videoWidth || !mediaCheckVideo.videoHeight) {
        mediaCheckStatus.textContent = 'Ошибка: камера ещё не готова. Подождите несколько секунд.';
        return;
    }

    identitySnapshotButton.disabled = true;
    identitySnapshotButton.textContent = 'Проверяем лицо...';
    mediaCheckStatus.textContent = 'Проверяем, есть ли лицо в кадре...';

    try {
        await loadDetector();
        resizeMediaCheckOverlay();
        const faces = await detectMediaCheckFaces();
        drawMediaCheckFaces(faces);

        if (faces.length === 0) {
            mediaCheckStatus.textContent = 'Лицо не обнаружено. Сядьте перед камерой и попробуйте сделать снимок ещё раз.';
            identitySnapshotButton.disabled = false;
            identitySnapshotButton.textContent = 'Сделать снимок';
            return;
        }

        if (faces.length > 1) {
            mediaCheckStatus.textContent = 'В кадре больше одного лица. Контрольный снимок можно сделать только с одним студентом.';
            identitySnapshotButton.disabled = false;
            identitySnapshotButton.textContent = 'Сделать снимок';
            return;
        }

        mediaCheckStatus.textContent = 'Лицо обнаружено. Отправляем контрольный снимок проктору...';
        await uploadIdentitySnapshot(state.mediaCheckStream);
        mediaCheckStatus.textContent = 'Снимок отправлен проктору. Переходим к проверке расширения...';
        setTimeout(showExtensionScreen, 700);
    } catch (error) {
        console.error(error);
        mediaCheckStatus.textContent = 'Ошибка: не удалось проверить лицо или сохранить снимок.';
        identitySnapshotButton.disabled = false;
        identitySnapshotButton.textContent = 'Сделать снимок';
    }
}

function resizeMediaCheckOverlay() {
    const rect = mediaCheckVideo.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (mediaCheckOverlay.width !== width || mediaCheckOverlay.height !== height) {
        mediaCheckOverlay.width = width;
        mediaCheckOverlay.height = height;
    }
}

function filterMediaCheckFaces(faces) {
    const frameArea = Math.max(1, mediaCheckVideo.videoWidth * mediaCheckVideo.videoHeight);
    return faces.filter((face) => {
        const score = typeof face.score === 'number' ? face.score : 1;
        const [, , width, height] = face.box;
        return score >= MEDIA_CHECK_FACE_CONFIDENCE_THRESHOLD && (width * height) / frameArea >= MEDIA_CHECK_MIN_FACE_AREA_RATIO;
    });
}

async function detectMediaCheckFaces() {
    let strongestFrameFaces = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await state.human.detect(mediaCheckVideo);
        const faces = filterMediaCheckFaces(result.face || []);
        if (faces.length > strongestFrameFaces.length) {
            strongestFrameFaces = faces;
        }
        if (faces.length > 1) {
            return faces;
        }
        await wait(180);
    }
    return strongestFrameFaces;
}

function drawMediaCheckFaces(faces) {
    mediaCheckCtx.clearRect(0, 0, mediaCheckOverlay.width, mediaCheckOverlay.height);
    mediaCheckCtx.lineWidth = 3;
    faces.forEach((face, index) => {
        const [x, y, width, height] = mirrorMediaCheckBox(face.box);
        mediaCheckCtx.strokeStyle = index === 0 ? '#0b7a75' : '#b42318';
        mediaCheckCtx.strokeRect(x, y, width, height);
    });
}

function mirrorMediaCheckBox(box) {
    const scaleX = mediaCheckOverlay.width / mediaCheckVideo.videoWidth;
    const scaleY = mediaCheckOverlay.height / mediaCheckVideo.videoHeight;
    const x = mediaCheckOverlay.width - (box[0] + box[2]) * scaleX;
    const y = box[1] * scaleY;
    return [x, y, box[2] * scaleX, box[3] * scaleY];
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkExtensionAndEnterExam() {
    extensionCheckButton.disabled = true;
    extensionCheckButton.textContent = 'Проверяем...';
    extensionGateStatus.textContent = 'Проверяем, отвечает ли расширение прокторинга...';
    clearInterval(state.extensionTimerId);
    state.extensionReady = false;
    window.postMessage({ type: 'PROCTORING_EXTENSION_PING' }, '*');
    setTimeout(() => {
        if (state.extensionReady) {
            clearInterval(state.extensionTimerId);
            state.extensionTimerId = setInterval(pingExtension, 3000);
            showExamScreen();
            return;
        }
        restartExtensionPolling();
        extensionCheckButton.disabled = false;
        extensionCheckButton.textContent = 'Я запустил расширение';
        extensionGateStatus.textContent = 'Ошибка: вы не запустили расширение.';
    }, 1000);
}

function restartExtensionPolling() {
    clearInterval(state.extensionTimerId);
    pingExtension();
    state.extensionTimerId = setInterval(pingExtension, 3000);
}

function showAccessToast(message) {
    accessToast.textContent = message;
    accessToast.hidden = false;
    clearTimeout(showAccessToast.timerId);
    showAccessToast.timerId = setTimeout(() => {
        accessToast.hidden = true;
    }, 4500);
}

function stop(message) {
    state.running = false;
    state.stopAt = 0;
    clearInterval(state.timerId);
    clearTimeout(state.snapshotTimerId);
    clearTimeout(state.recordingTimerId);
    state.timerId = null;
    state.snapshotTimerId = null;
    state.recordingTimerId = null;
    state.violationStreaks.clear();

    if (state.recorder && state.recorder.state !== 'inactive') {
        state.recorder.stop();
    }
    state.recorder = null;

    if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
        state.stream = null;
    }

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    camera.srcObject = null;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    cameraEmpty.hidden = false;
    cameraEmpty.textContent = 'Камера остановлена';
    timer.textContent = '00:00';
    timeWarning.hidden = true;
    fullscreenWarning.hidden = true;
    screenshotWarning.hidden = true;
    faceMissingWarning.hidden = true;
    multipleFacesWarning.hidden = true;
    if (!state.examFailed) {
        examFailedWarning.hidden = true;
    }
    finishExam.disabled = true;
    sessionSelect.disabled = false;
    setStatus(message);
}

async function submitExam() {
    const questions = [...document.querySelectorAll('.question')];
    let score = 0;

    questions.forEach((question) => {
        const correctAnswer = question.dataset.correct;
        const selected = question.querySelector('input[type="radio"]:checked');
        const selectedAnswer = selected ? selected.value : '';
        const isCorrect = selectedAnswer === correctAnswer;
        const badge = question.querySelector('.score-badge');

        question.classList.add('checked');
        question.querySelectorAll('input').forEach((input) => {
            input.disabled = true;
        });

        question.querySelectorAll('label').forEach((label) => {
            label.classList.remove('answer-correct', 'answer-wrong');
            if (label.dataset.answer === correctAnswer) {
                label.classList.add('answer-correct');
            }
            if (!isCorrect && label.dataset.answer === selectedAnswer) {
                label.classList.add('answer-wrong');
            }
        });

        badge.textContent = isCorrect ? '20 баллов · Верно' : '20 баллов · Неверно';
        badge.classList.toggle('correct', isCorrect);
        badge.classList.toggle('wrong', !isCorrect);
        if (isCorrect) {
            score += 20;
        }
    });

    examResult.hidden = false;
    examResult.textContent = `Результат теста: ${score} из 100 баллов`;
    finishExam.disabled = true;
    await reportViolation('TEST_SUBMITTED', 1, `Студент сдал тест. Результат: ${score} из 100 баллов`)
        .catch((error) => console.error(error));
    stop('Экзамен отправлен');
}

function blockCopyAttempt(event) {
    event.preventDefault();
    if (state.running) {
        reportViolation('COPY_ATTEMPT', 5, 'Студент попытался скопировать текст теста');
    }
}

function blockScreenshotAttempt() {
    screenshotWarning.hidden = false;
    reportViolation('SCREENSHOT_ATTEMPT', 5, 'Студент попытался сделать скриншот или распечатать страницу экзамена');
    clearTimeout(blockScreenshotAttempt.timerId);
    blockScreenshotAttempt.timerId = setTimeout(() => {
        screenshotWarning.hidden = true;
    }, 2500);
}

async function enterFullscreen() {
    if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
    }
}

function scheduleSnapshotCapture() {
    state.snapshotTimerId = setTimeout(async () => {
        await captureSnapshot('Плановый снимок камеры каждые 5 минут');
        scheduleSnapshotCapture();
    }, MEDIA_INTERVAL_MS);
}

async function recordTenSecondClip() {
    if (!window.MediaRecorder || !state.stream) {
        await reportViolation('MANUAL_NOTE', 2, 'Браузер не поддерживает запись видео через MediaRecorder');
        return;
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';
    const chunks = [];
    state.recorder = new MediaRecorder(state.stream, { mimeType });
    state.recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
            chunks.push(event.data);
        }
    });
    state.recorder.addEventListener('stop', async () => {
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size > 0) {
            await uploadRecordingChunk(blob);
        }
        state.recorder = null;
    });
    state.recorder.start();
    if (state.running) {
        state.recordingTimerId = setTimeout(recordTenSecondClip, MEDIA_INTERVAL_MS);
    }
    setTimeout(() => {
        if (state.recorder && state.recorder.state !== 'inactive') {
            state.recorder.stop();
        }
    }, RECORDING_DURATION_MS);
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

    if (!state.fiveMinuteWarningShown && leftMs <= FIVE_MINUTES_MS) {
        state.fiveMinuteWarningShown = true;
        timeWarning.hidden = false;
    }
    if (totalSeconds <= 0) {
        stop('Время экзамена истекло');
    }
}

async function loadDetector() {
    if (state.human) {
        return;
    }
    if (!window.Human) {
        throw new Error('Не удалось загрузить детектор лица');
    }

    setStatus('Загрузка детектора лица...');
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
        object: { enabled: true, minConfidence: 0.35, maxDetected: 10 },
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
    const objects = result.object || [];
    clearFaceOverlay();
    await evaluateFrame(faces);
    await evaluateObjects(objects);
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
    });
}

function clearFaceOverlay() {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
}

async function evaluateObjects(objects) {
    const phone = objects.find((object) => {
        const label = String(object.label || object.class || object.name || '').toLowerCase();
        return PHONE_LABELS.some((phoneLabel) => label.includes(phoneLabel));
    });
    if (phone) {
        const confirmed = await reportConfirmedViolation('PHONE_DETECTED', 5, 'В кадре обнаружен телефон');
        if (confirmed) {
            await failExamForPhone();
        }
    } else {
        resetViolation('PHONE_DETECTED');
    }
}

async function failExamForPhone() {
    if (state.examFailed) {
        return;
    }
    state.examFailed = true;
    await captureSnapshot('Снимок нарушения: в кадре обнаружен телефон')
        .catch((error) => console.error(error));
    await reportViolation('EXAM_FAILED_PHONE', 5, 'Экзамен остановлен и провален: в кадре обнаружен телефон')
        .catch((error) => console.error(error));
    stop('Экзамен остановлен. Обнаружен телефон.');
    examFailedWarning.hidden = false;
}

async function evaluateFrame(faces) {
    if (faces.length === 0) {
        const confirmed = await reportConfirmedViolation('FACE_NOT_DETECTED', 4, 'Лицо не обнаружено в кадре камеры');
        if (confirmed) {
            faceMissingWarning.hidden = false;
            multipleFacesWarning.hidden = true;
        }
        return;
    }
    faceMissingWarning.hidden = true;
    if (faces.length > 1) {
        const confirmed = await reportConfirmedViolation('MULTIPLE_FACES', 5, `В кадре обнаружено несколько лиц: ${faces.length}`);
        if (confirmed) {
            multipleFacesWarning.hidden = false;
        }
        return;
    }

    multipleFacesWarning.hidden = true;
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
        await reportConfirmedViolation('FACE_NOT_CENTERED', 2, 'Лицо вышло из центральной зоны кадра');
        return;
    }
    resetViolation('FACE_NOT_CENTERED');
}

async function reportConfirmedViolation(type, severity, details) {
    const streak = (state.violationStreaks.get(type) || 0) + 1;
    state.violationStreaks.set(type, streak);
    if (streak >= VIOLATION_CONFIRM_FRAMES) {
        await reportViolation(type, severity, details);
        return true;
    }
    return false;
}

function resetViolation(type) {
    state.violationStreaks.delete(type);
}

async function reportViolation(type, severity, details) {
    if (!state.sessionId || !state.token) {
        return;
    }

    const now = Date.now();
    const cooldownMs = type === 'MANUAL_NOTE' ? 0 : 6000;
    if ((state.lastEventAt.get(type) || 0) + cooldownMs > now) {
        return;
    }

    state.lastEventAt.set(type, now);
    await api(`/api/sessions/${state.sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, severity, details }),
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

function pingExtension() {
    const wasReady = state.extensionReady;
    state.extensionReady = false;
    window.postMessage({ type: 'PROCTORING_EXTENSION_PING' }, '*');
    setTimeout(() => {
        renderExtensionState();
        if (state.running && wasReady && !state.extensionReady) {
            reportViolation('EXTENSION_DISCONNECTED', 5, 'Расширение прокторинга не отвечает');
        }
    }, 800);
}

function renderExtensionState() {
    extensionState.className = state.extensionReady ? 'camera-status ok' : 'camera-status warn';
    extensionState.textContent = state.extensionReady
        ? 'Расширение прокторинга активно'
        : 'Расширение прокторинга не найдено';
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

function statusLabel(status) {
    const labels = {
        CREATED: 'Создана',
        ACTIVE: 'Открыта',
        IN_PROGRESS: 'Идёт',
        COMPLETED: 'Завершена',
        FLAGGED: 'На проверке',
        CANCELLED: 'Отменена',
    };
    return labels[status] || status;
}

function setStatus(text) {
    statusText.textContent = text;
}

