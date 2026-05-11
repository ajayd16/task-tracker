-- =============================================================
-- Task Tracker — Supabase schema
-- Paste this entire file into the Supabase SQL editor and run it.
-- It is idempotent: safe to re-run.
-- =============================================================

-- ---------- profiles (one row per auth user) ------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'You',
  initials text not null default 'YO',
  color text not null default '#0B1F3D',
  created_at timestamptz not null default now()
);

-- ---------- contacts (per-user address book) ------------------
-- Collaborators reference contacts, not profiles. Lets you label
-- people without requiring them to sign up. A future migration
-- can link a contact to a real profile.
create table if not exists public.contacts (
  id text primary key,                -- short slug, e.g. 'aja'
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  initials text not null,
  color text not null default '#4A5E80',
  created_at timestamptz not null default now()
);
create index if not exists contacts_owner_idx on public.contacts(owner_id);

-- ---------- tasks --------------------------------------------
create table if not exists public.tasks (
  id text primary key,                -- keeps the original 'T-XXXXX' ids
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  project text not null default 'inbox',
  priority text not null default 'med',
  status text not null default 'todo',
  due date,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists tasks_owner_idx on public.tasks(owner_id);
create index if not exists tasks_due_idx on public.tasks(due);

-- ---------- task_collaborators (join) ------------------------
create table if not exists public.task_collaborators (
  task_id text not null references public.tasks(id) on delete cascade,
  contact_id text not null references public.contacts(id) on delete cascade,
  primary key (task_id, contact_id)
);
create index if not exists task_collab_task_idx on public.task_collaborators(task_id);

-- ---------- task_comments ------------------------------------
create table if not exists public.task_comments (
  id text primary key,
  task_id text not null references public.tasks(id) on delete cascade,
  author_id text not null references public.contacts(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments(task_id);

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.profiles            enable row level security;
alter table public.contacts            enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_collaborators  enable row level security;
alter table public.task_comments       enable row level security;

-- Drop-and-recreate so this script is idempotent
drop policy if exists "profiles self read"      on public.profiles;
drop policy if exists "profiles self write"     on public.profiles;
drop policy if exists "profiles self update"    on public.profiles;

drop policy if exists "contacts owner all"      on public.contacts;
drop policy if exists "tasks owner all"         on public.tasks;
drop policy if exists "task_collab owner all"   on public.task_collaborators;
drop policy if exists "task_comments owner all" on public.task_comments;

-- profiles: a user can read and edit only their own row
create policy "profiles self read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles self write"  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);

-- contacts: a user owns their address book
create policy "contacts owner all" on public.contacts
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- tasks: a user owns their tasks
create policy "tasks owner all" on public.tasks
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- task_collaborators: only accessible if you own the parent task
create policy "task_collab owner all" on public.task_collaborators
  for all using (
    exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
  );

-- task_comments: only accessible if you own the parent task
create policy "task_comments owner all" on public.task_comments
  for all using (
    exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
  );

-- =============================================================
-- Seed on signup
-- Runs as the postgres role (security definer), so it can insert
-- on behalf of the new user even before they have a session.
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := new.id;
  today date := current_date;
  ts timestamptz := now();
  t_id text;
begin
  -- profile
  insert into public.profiles (id, display_name, initials, color)
  values (uid, 'You', 'YO', '#0B1F3D');

  -- contacts (the user is 'me'; the rest are example contacts)
  insert into public.contacts (id, owner_id, name, initials, color) values
    ('me',  uid, 'You',          'YO', '#0B1F3D'),
    ('aja', uid, 'Aja Patel',    'AP', '#2E5BFF'),
    ('mar', uid, 'Mar Cruz',     'MC', '#7A3FE0'),
    ('ren', uid, 'Ren Okafor',   'RO', '#1F8A5B'),
    ('kim', uid, 'Kim Lassiter', 'KL', '#E07A1F'),
    ('ses', uid, 'Ses Iqbal',    'SI', '#C13B3B');

  -- helper for task ids
  -- 12 tasks mirroring the original seed data
  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, description, project, priority, status, due, created_at)
  values (t_id, uid, 'Ship dashboard v1 to staging',
    'Cut a clean release branch, run smoke tests, push to staging.k8s. Validate the new pulse charts render under low-data state.',
    'dashboard', 'high', 'doing', today, ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me'), (t_id, 'aja'), (t_id, 'mar');
  insert into public.task_comments (id, task_id, author_id, text, created_at) values
    ('C-' || upper(substr(md5(random()::text), 1, 5)), t_id, 'aja', 'Smoke tests are green on my machine.', ts - interval '5 hours'),
    ('C-' || upper(substr(md5(random()::text), 1, 5)), t_id, 'me',  'Pushing to staging after the OKR sync.', ts - interval '3 hours');

  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, description, project, priority, status, due, created_at)
  values (t_id, uid, 'Review Q3 roadmap doc',
    'Read v4 of the roadmap, comment on the platform OKR, suggest sequencing changes.',
    'okrs', 'med', 'todo', today, ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me'), (t_id, 'ren');

  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, description, project, priority, status, due, completed_at, created_at)
  values (t_id, uid, 'Morning run · 5km', 'Easy zone-2 along the river.',
    'health', 'low', 'done', today, ts - interval '2 hours', ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me');
  insert into public.task_comments (id, task_id, author_id, text, created_at) values
    ('C-' || upper(substr(md5(random()::text), 1, 5)), t_id, 'me', 'Felt good. Cadence ~178.', ts - interval '2 hours');

  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, project, priority, status, due, created_at)
  values (t_id, uid, 'Pick up dry cleaning', 'home', 'low', 'todo', today, ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me');

  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, description, project, priority, status, due, created_at)
  values (t_id, uid, 'Chapter 4 — Designing Data-Intensive Apps',
    'Replication chapter — focus on consensus and leader election sections.',
    'reading', 'med', 'todo', today + 1, ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me');

  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, project, priority, status, due, created_at)
  values (t_id, uid, 'Sync with design team', 'dashboard', 'high', 'todo', today + 1, ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me'), (t_id, 'kim'), (t_id, 'ses');

  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, project, priority, status, due, created_at)
  values (t_id, uid, 'Annual physical · 09:00', 'health', 'med', 'todo', today + 2, ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me');

  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, project, priority, status, due, created_at)
  values (t_id, uid, 'Draft Q3 OKRs', 'okrs', 'crit', 'todo', today + 3, ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me'), (t_id, 'aja'), (t_id, 'ren');

  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, project, priority, status, due, created_at)
  values (t_id, uid, 'Call parents', 'home', 'med', 'todo', today + 4, ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me');

  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, project, priority, status, due, completed_at, created_at)
  values (t_id, uid, 'Submit expense report', 'home', 'med', 'done', today - 1, ts - interval '2 hours', ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me');

  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, project, priority, status, due, completed_at, created_at)
  values (t_id, uid, 'Yoga class', 'health', 'low', 'done', today - 2, ts - interval '2 hours', ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me');

  t_id := 'T-' || upper(substr(md5(random()::text), 1, 5));
  insert into public.tasks (id, owner_id, title, project, priority, status, due, completed_at, created_at)
  values (t_id, uid, 'Pay credit card bill', 'home', 'high', 'done', today - 3, ts - interval '2 hours', ts - interval '3 days');
  insert into public.task_collaborators values (t_id, 'me');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
