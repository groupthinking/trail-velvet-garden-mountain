alter table bridge_config
  add column if not exists build_wake_url text,
  add column if not exists build_wake_key text;
