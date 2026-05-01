# Proctoring System

Privacy-oriented proctoring API for exam sessions, events, roles, audit logs, and deployment practice.

## Stack

- Java 17
- Spring Boot 3
- Spring Security, JWT, RBAC
- Spring Data JPA, PostgreSQL, Flyway
- Redis and Kafka infrastructure placeholders
- JUnit 5, Mockito, Testcontainers
- Docker, Docker Compose, Kubernetes
- GitHub Actions CI
- k6 performance checks

## Architecture

```text
Controller -> Service -> Repository -> Domain
     |           |             |
     v           v             v
    DTO       Mapper      JPA entities
```

Main packages:

- `controller`: REST API and error handling.
- `service`: business use cases and audit logging.
- `repository`: Spring Data persistence layer.
- `repository.entity`: database models.
- `domain`: roles, statuses, event types.
- `dto`: request and response contracts.
- `mapper`: DTO/entity conversion.
- `security`: JWT issuing and authentication filter.

## API Examples

Register:

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "student@example.com",
  "password": "password123",
  "fullName": "Student One",
  "roles": ["STUDENT"]
}
```

Login:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "proctor@example.com",
  "password": "password123"
}
```

Create exam session:

```http
POST /api/sessions
Authorization: Bearer <token>
Content-Type: application/json

{
  "examTitle": "Java Final Exam",
  "studentId": "00000000-0000-0000-0000-000000000000",
  "proctorId": "00000000-0000-0000-0000-000000000001",
  "startsAt": "2026-05-01T09:00:00Z",
  "endsAt": "2026-05-01T11:00:00Z"
}
```

Create proctoring event:

```http
POST /api/sessions/{sessionId}/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "TAB_SWITCH",
  "severity": 3,
  "details": "Student switched browser tab during the exam"
}
```

## Local Run

Start infrastructure:

```bash
docker compose up -d
```

Run the app:

```bash
mvn spring-boot:run
```

For local demo users with privileged roles, run with the `local` profile:

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

Health check:

```bash
curl http://localhost:8080/actuator/health
```

Camera proctoring demo:

```text
http://localhost:8080/proctoring-camera/
```

Run with the `local` profile, log in as `proctor@example.com` / `password123`, create an exam session through the API if none exists, then select it on the page and start the camera. The browser detects `FACE_NOT_DETECTED`, `MULTIPLE_FACES`, and `FACE_NOT_CENTERED` events and stores them through the existing proctoring event API.

Full exam demonstration:

```text
Student page: http://localhost:8080/exam-demo/
Proctor page: http://localhost:8080/proctor-dashboard/
```

Run with the `local` profile and use these demo accounts:

```text
student@example.com / password123
proctor@example.com / password123
admin@example.com / password123
```

Suggested presentation flow:

1. Open the proctor dashboard and sign in as the proctor.
2. Open the student exam page in another browser window and sign in as the student.
3. Start the exam and allow camera access.
4. Switch tabs, hide your face, or move out of the center of the camera frame.
5. Watch the violations appear in the proctor dashboard with a calculated risk level.

During the demo exam, the browser also:

- Saves an initial camera snapshot after exam start.
- Saves another camera snapshot at a random moment inside each 3-minute window.
- Records the camera stream with `MediaRecorder` and uploads `webm` chunks every 30 seconds.

Media files are stored under `storage/proctoring` by default. Override the location with:

```bash
PROCTORING_STORAGE_ROOT=/path/to/proctoring-storage
```

## Tests

Unit and web tests:

```bash
mvn test
```

Integration tests use Testcontainers and require Docker:

```bash
mvn test -Dgroups=integration
```

Performance smoke test:

```bash
k6 run performance/k6/proctoring-api.js
```

Optional parameters:

```bash
k6 run -e BASE_URL=http://localhost:8080 -e VUS=10 -e DURATION=1m performance/k6/proctoring-api.js
```

## Kubernetes

Build image:

```bash
mvn -DskipTests package
docker build -t proctoring-system:latest .
```

Apply manifests:

```bash
kubectl apply -f k8s/secrets.example.yml
kubectl apply -f k8s/deployment.yml
```

## GitHub Process

- Branches: `main`, `dev`, `feature/*`
- Commit tags: `feat`, `fix`, `refactor`, `test`, `docs`, `ci`
- Pull requests target `dev`; release PRs target `main`
- Kanban columns: Backlog, In Progress, Review, Done

## Roadmap

- Add media upload and encrypted artifact storage.
- Add Kafka event stream for real-time violation processing.
- Add Redis-backed token denylist and rate limiting.
