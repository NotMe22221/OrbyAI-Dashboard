-- Resident Secretary Dashboard schema v1.0
-- Exact required tables: sessions, messages, agent_log, actions, integrations

create extension if not exists pgcrypto;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  started_at timestamptz default now(),
  ended_at timestamptz,
  summary text
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions,
  role text check (role in ('user','assistant')),
  content text,
  voice_summary text,
  created_at timestamptz default now()
);

create table if not exists agent_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions,
  agent text check (agent in ('agent_a','agent_b')),
  input jsonb,
  output jsonb,
  latency_ms integer,
  tokens_used integer,
  created_at timestamptz default now()
);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions,
  service text,
  operation text,
  params jsonb,
  approved boolean,
  executed_at timestamptz,
  result jsonb
);

create table if not exists integrations (
  user_id uuid references auth.users,
  service text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  account_email text,
  primary key (user_id, service)
);

create index if not exists idx_sessions_user_started on sessions(user_id, started_at desc);
create index if not exists idx_messages_session_created on messages(session_id, created_at asc);
create index if not exists idx_agent_log_session_created on agent_log(session_id, created_at asc);
create index if not exists idx_actions_session_executed on actions(session_id, executed_at asc);
create index if not exists idx_integrations_user on integrations(user_id);

alter table sessions enable row level security;
alter table messages enable row level security;
alter table agent_log enable row level security;
alter table actions enable row level security;
alter table integrations enable row level security;

create policy if not exists "sessions_select_own" on sessions
  for select using (auth.uid() = user_id);
create policy if not exists "sessions_insert_own" on sessions
  for insert with check (auth.uid() = user_id);
create policy if not exists "sessions_update_own" on sessions
  for update using (auth.uid() = user_id);

create policy if not exists "messages_select_own" on messages
  for select using (
    exists (
      select 1 from sessions s where s.id = messages.session_id and s.user_id = auth.uid()
    )
  );
create policy if not exists "messages_insert_own" on messages
  for insert with check (
    exists (
      select 1 from sessions s where s.id = messages.session_id and s.user_id = auth.uid()
    )
  );

create policy if not exists "agent_log_select_own" on agent_log
  for select using (
    exists (
      select 1 from sessions s where s.id = agent_log.session_id and s.user_id = auth.uid()
    )
  );
create policy if not exists "agent_log_insert_own" on agent_log
  for insert with check (
    exists (
      select 1 from sessions s where s.id = agent_log.session_id and s.user_id = auth.uid()
    )
  );

create policy if not exists "actions_select_own" on actions
  for select using (
    exists (
      select 1 from sessions s where s.id = actions.session_id and s.user_id = auth.uid()
    )
  );
create policy if not exists "actions_insert_own" on actions
  for insert with check (
    exists (
      select 1 from sessions s where s.id = actions.session_id and s.user_id = auth.uid()
    )
  );

create policy if not exists "integrations_select_own" on integrations
  for select using (auth.uid() = user_id);
create policy if not exists "integrations_insert_own" on integrations
  for insert with check (auth.uid() = user_id);
create policy if not exists "integrations_update_own" on integrations
  for update using (auth.uid() = user_id);
create policy if not exists "integrations_delete_own" on integrations
  for delete using (auth.uid() = user_id);



