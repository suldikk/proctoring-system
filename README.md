# Система прокторинга

API и демонстрационный интерфейс для онлайн-прокторинга: экзаменационные сессии, события нарушений, роли, аудит, снимки камеры, запись видео и развертывание.

## Стек

- Java 17
- Spring Boot 3
- Spring Security, JWT, RBAC/ABAC
- Spring Data JPA, PostgreSQL, Flyway
- Redis и Kafka как инфраструктурные компоненты
- JUnit 5, Mockito, Testcontainers
- Docker, Docker Compose, Kubernetes
- GitHub Actions CI
- k6 для нагрузочной проверки

## Архитектура

```text
Controller -> Service -> Repository -> Domain
     |           |             |
     v           v             v
    DTO       Mapper      JPA entities
```

Основные пакеты:

- `controller`: REST API и обработка ошибок.
- `service`: бизнес-сценарии, проверки доступа и аудит.
- `repository`: слой доступа к данным через Spring Data.
- `repository.entity`: JPA-модели базы данных.
- `domain`: роли, статусы, типы событий.
- `dto`: контракты запросов и ответов.
- `mapper`: преобразование entity в DTO.
- `security`: JWT и фильтр аутентификации.

## Примеры API

Регистрация:

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "student@example.com",
  "password": "password123",
  "fullName": "Студент Один",
  "roles": ["STUDENT"]
}
```

Вход:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "proctor@example.com",
  "password": "password123"
}
```

Создание экзаменационной сессии:

```http
POST /api/sessions
Authorization: Bearer <token>
Content-Type: application/json

{
  "examTitle": "Итоговый экзамен по Java",
  "studentId": "00000000-0000-0000-0000-000000000000",
  "proctorId": "00000000-0000-0000-0000-000000000001",
  "startsAt": "2026-05-01T09:00:00Z",
  "endsAt": "2026-05-01T11:00:00Z"
}
```

Создание события прокторинга:

```http
POST /api/sessions/{sessionId}/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "TAB_SWITCH",
  "severity": 3,
  "details": "Студент переключил вкладку во время экзамена"
}
```

## Локальный запуск

Запуск инфраструктуры:

```bash
docker compose up -d
```

Запуск приложения:

```bash
mvn spring-boot:run
```

Для демонстрации с тестовыми пользователями запускайте профиль `local`:

```bash
mvn spring-boot:run "-Dspring-boot.run.profiles=local"
```

Проверка состояния:

```bash
curl http://localhost:8080/actuator/health
```

## Демонстрация

Техническая страница камеры:

```text
http://localhost:8080/proctoring-camera/
```

Полная демонстрация экзамена:

```text
Страница студента: http://localhost:8080/exam-demo/
Панель проктора: http://localhost:8080/proctor-dashboard/
```

Демо-аккаунты:

```text
student@example.com / password123
proctor@example.com / password123
admin@example.com / password123
```

Сценарий показа:

1. Откройте панель проктора и войдите как проктор.
2. Откройте страницу студента в другом окне браузера и войдите как студент.
3. Нажмите `Начать экзамен` и разрешите доступ к камере.
4. Переключите вкладку, закройте лицо или выйдите из центра кадра.
5. Покажите, как нарушения появляются в панели проктора и меняют уровень риска.

Во время экзамена браузер также:

- требует установленное расширение `Java Proctoring Guard`;
- запрашивает камеру, микрофон и полноэкранный режим;
- затемняет страницу теста при выходе из полноэкранного режима;
- фиксирует выход из полноэкранного режима, переключение вкладок, отсутствие лица, несколько лиц и телефон в кадре;
- показывает студенту предупреждение за 5 минут до конца экзамена;
- сохраняет снимок камеры при старте и далее каждые 5 минут;
- записывает 10-секундный `webm`-фрагмент при старте и далее каждые 5 минут.

На странице студента отображаются только тест, таймер, камера, ФИО, группа, дисциплина и количество вопросов. Журнал событий, количество нарушений, снимки и фрагменты записи отображаются только в панели проктора.

## Расширение браузера

MVP расширения находится в папке:

```text
browser-extension
```

Как установить в Chrome:

1. Откройте `chrome://extensions/`.
2. Включите `Developer mode`.
3. Нажмите `Load unpacked`.
4. Выберите папку `browser-extension`.
5. Откройте страницу `http://localhost:8080/exam-demo/`.

Без расширения кнопка `Начать экзамен` остаётся заблокированной.

Файлы по умолчанию сохраняются в:

```text
storage/proctoring
```

Путь можно изменить переменной окружения:

```bash
PROCTORING_STORAGE_ROOT=/path/to/proctoring-storage
```

## Тесты

Unit- и web-тесты:

```bash
mvn test
```

Интеграционные тесты используют Testcontainers и требуют Docker:

```bash
mvn test -Dgroups=integration
```

Нагрузочная smoke-проверка:

```bash
k6 run performance/k6/proctoring-api.js
```

Параметры запуска:

```bash
k6 run -e BASE_URL=http://localhost:8080 -e VUS=10 -e DURATION=1m performance/k6/proctoring-api.js
```

## Kubernetes

Сборка образа:

```bash
mvn -DskipTests package
docker build -t proctoring-system:latest .
```

Применение манифестов:

```bash
kubectl apply -f k8s/secrets.example.yml
kubectl apply -f k8s/deployment.yml
```

## Процесс на GitHub

- Ветки: `main`, `dev`, `feature/*`
- Теги коммитов: `feat`, `fix`, `refactor`, `test`, `docs`, `ci`
- Pull Request из `feature/*` направляется в `dev`
- Релизный Pull Request направляется из `dev` в `main`
- Доска задач: Backlog, In Progress, Review, Done

## Roadmap

- Добавить зашифрованное хранилище артефактов.
- Добавить Kafka-поток событий для обработки нарушений в реальном времени.
- Добавить Redis denylist для токенов и rate limiting.
