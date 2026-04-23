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
  "email": "proctor@example.com",
  "password": "password123",
  "fullName": "Main Proctor",
  "roles": ["PROCTOR"]
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

Health check:

```bash
curl http://localhost:8080/actuator/health
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

- Add ABAC rules for student-owned sessions.
- Add media upload and encrypted artifact storage.
- Add Kafka event stream for real-time violation processing.
- Add Redis-backed token denylist and rate limiting.
- Add k6 or Gatling performance scenarios.
