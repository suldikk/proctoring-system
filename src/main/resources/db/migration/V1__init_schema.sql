create table users (
    id uuid primary key,
    email varchar(180) not null unique,
    password_hash varchar(255) not null,
    full_name varchar(120) not null,
    created_at timestamp with time zone not null
);

create table user_roles (
    user_id uuid not null references users(id) on delete cascade,
    role varchar(40) not null,
    primary key (user_id, role)
);

create table exam_sessions (
    id uuid primary key,
    exam_title varchar(160) not null,
    student_id uuid not null references users(id),
    proctor_id uuid references users(id),
    status varchar(40) not null,
    starts_at timestamp with time zone not null,
    ends_at timestamp with time zone not null
);

create table proctoring_events (
    id uuid primary key,
    session_id uuid not null references exam_sessions(id) on delete cascade,
    type varchar(60) not null,
    severity integer not null check (severity between 1 and 5),
    details varchar(1000) not null,
    occurred_at timestamp with time zone not null
);

create table audit_logs (
    id uuid primary key,
    actor_email varchar(180) not null,
    action varchar(120) not null,
    resource_type varchar(120) not null,
    resource_id varchar(120) not null,
    created_at timestamp with time zone not null
);

create index idx_exam_sessions_student_id on exam_sessions(student_id);
create index idx_exam_sessions_proctor_id on exam_sessions(proctor_id);
create index idx_proctoring_events_session_id on proctoring_events(session_id);
create index idx_audit_logs_actor_email on audit_logs(actor_email);
