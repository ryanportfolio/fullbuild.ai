create table style (
    id uniqueidentifier primary key,
    style_number varchar(40) not null unique,
    name varchar(120) not null,
    season varchar(40) not null,
    status varchar(24) not null,
    readiness int not null check (readiness between 0 and 100),
    launch_date date not null,
    updated_at datetimeoffset not null,
    version bigint not null default 0
);

create table milestone (
    id uniqueidentifier primary key,
    style_id uniqueidentifier not null references style(id) on delete cascade,
    milestone_key varchar(40) not null,
    state varchar(20) not null,
    source_updated_at datetimeoffset null,
    constraint uq_milestone_style_key unique (style_id, milestone_key)
);

create table blocker (
    id uniqueidentifier primary key,
    style_id uniqueidentifier not null references style(id) on delete cascade,
    severity varchar(16) not null,
    code varchar(40) not null,
    title varchar(240) not null,
    resolved_at datetimeoffset null,
    resolved_by varchar(120) null,
    version bigint not null default 0
);

create table integration_event (
    id uniqueidentifier primary key,
    style_id uniqueidentifier not null references style(id) on delete cascade,
    source varchar(40) not null,
    type varchar(80) not null,
    state varchar(20) not null,
    occurred_at datetimeoffset not null,
    received_at datetimeoffset not null,
    correlation_id varchar(80) not null,
    attempt int not null default 1,
    version bigint not null default 0
);

create table idempotency_record (
    idempotency_key varchar(120) primary key,
    payload_hash char(64) not null,
    created_at datetimeoffset not null
);

create index idx_style_season_status on style (season, status);
create index idx_style_season_readiness on style (season, readiness);
create index idx_blocker_style_severity on blocker (style_id, severity) where resolved_at is null;
create index idx_integration_source_time on integration_event (source, occurred_at desc);
create index idx_integration_style_time on integration_event (style_id, occurred_at desc);
create index idx_idempotency_created on idempotency_record (created_at);
