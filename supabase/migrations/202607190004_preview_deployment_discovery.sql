create table if not exists public.repository_preview_configs (
  id uuid primary key default gen_random_uuid(),
  github_owner text not null,
  github_repository text not null,
  provider text not null default 'VERCEL',
  vercel_project_id text,
  vercel_team_id text,
  production_url text,
  enabled boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repository_preview_configs_provider_check
    check (provider = 'VERCEL'),
  constraint repository_preview_configs_normalized_repository_check
    check (github_owner = lower(github_owner) and github_repository = lower(github_repository)),
  constraint repository_preview_configs_enabled_fields_check
    check (
      not enabled
      or (
        vercel_project_id is not null
        and production_url is not null
      )
    ),
  unique (github_owner, github_repository)
);

drop trigger if exists repository_preview_configs_set_updated_at
on public.repository_preview_configs;
create trigger repository_preview_configs_set_updated_at
before update on public.repository_preview_configs
for each row execute function public.set_updated_at();

alter table public.repository_preview_configs enable row level security;

drop policy if exists "prototype preview configs are readable"
on public.repository_preview_configs;
create policy "prototype preview configs are readable"
on public.repository_preview_configs for select
to anon, authenticated
using (true);

drop policy if exists "prototype preview configs are creatable"
on public.repository_preview_configs;
create policy "prototype preview configs are creatable"
on public.repository_preview_configs for insert
to anon, authenticated
with check (created_by <> '');

drop policy if exists "prototype preview configs are editable"
on public.repository_preview_configs;
create policy "prototype preview configs are editable"
on public.repository_preview_configs for update
to anon, authenticated
using (true)
with check (created_by <> '');

alter table public.boards
add column if not exists preview_provider text,
add column if not exists preview_base_url text,
add column if not exists preview_url text,
add column if not exists preview_deployment_id text,
add column if not exists preview_deployment_status text,
add column if not exists preview_commit_sha text,
add column if not exists preview_branch text,
add column if not exists preview_last_checked_at timestamptz,
add column if not exists preview_failure_reason text;

alter table public.boards
drop constraint if exists boards_preview_provider_check;
alter table public.boards
add constraint boards_preview_provider_check
check (preview_provider is null or preview_provider = 'VERCEL');

alter table public.boards
drop constraint if exists boards_preview_deployment_status_check;
alter table public.boards
add constraint boards_preview_deployment_status_check
check (
  preview_deployment_status is null
  or preview_deployment_status in (
    'QUEUED',
    'BUILDING',
    'READY',
    'FAILED',
    'CANCELLED',
    'NOT_FOUND',
    'ACCESS_REQUIRED'
  )
);

create index if not exists boards_preview_deployment_status_idx
on public.boards (preview_deployment_status)
where preview_deployment_status in ('QUEUED', 'BUILDING');
