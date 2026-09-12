create table if not exists bridge_config (
  id text primary key default 'default',
  build_key_hash text not null,
  chief_key_hash text not null,
  chief_wake_url text,
  chief_wake_key text,
  created_at timestamptz not null default now()
);

create table if not exists bridge_messages (
  id text primary key,
  from_party text not null,
  to_party text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bridge_messages_created_idx
  on bridge_messages (created_at desc);

create index if not exists bridge_messages_inbox_idx
  on bridge_messages (to_party, read_at, created_at desc);

create table if not exists bridge_heartbeats (
  party text primary key,
  last_seen timestamptz not null
);
