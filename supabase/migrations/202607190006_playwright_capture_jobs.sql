create table if not exists public.repository_capture_configs (
  id uuid primary key default gen_random_uuid(),
  github_owner text not null,
  github_repository text not null,
  capture_options jsonb not null default '{}'::jsonb,
  viewports jsonb not null default '[]'::jsonb,
  storage_state_env_var text,
  login_setup jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repository_capture_configs_repository_check
    check (github_owner = lower(github_owner) and github_repository = lower(github_repository)),
  constraint repository_capture_configs_json_check
    check (
      jsonb_typeof(capture_options) = 'object'
      and jsonb_typeof(viewports) = 'array'
      and jsonb_typeof(login_setup) = 'array'
    ),
  unique (github_owner, github_repository)
);

drop trigger if exists repository_capture_configs_set_updated_at
on public.repository_capture_configs;
create trigger repository_capture_configs_set_updated_at
before update on public.repository_capture_configs
for each row execute function public.set_updated_at();

create table if not exists public.capture_jobs (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  capture_config_id uuid references public.repository_capture_configs(id) on delete set null,
  route_path text not null,
  resolved_path text not null,
  head_sha text not null,
  base_sha text,
  scenario text not null,
  viewport jsonb not null,
  capture_options jsonb not null,
  auth_config jsonb not null default '{}'::jsonb,
  base_url text not null,
  preview_url text not null,
  capture_key text not null,
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'STALE')),
  attempt integer not null default 1 check (attempt between 1 and 20),
  retry_of uuid references public.capture_jobs(id) on delete set null,
  rerun_of uuid references public.capture_jobs(id) on delete set null,
  claimed_by text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  capture_duration_ms integer check (capture_duration_ms is null or capture_duration_ms >= 0),
  base_result jsonb,
  pr_result jsonb,
  error_code text,
  error_message text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capture_jobs_route_check
    check (left(route_path, 1) = '/' and left(resolved_path, 1) = '/'),
  constraint capture_jobs_sha_check
    check (
      head_sha ~ '^[A-Fa-f0-9]{7,64}$'
      and (base_sha is null or base_sha ~ '^[A-Fa-f0-9]{7,64}$')
    ),
  constraint capture_jobs_json_check
    check (
      jsonb_typeof(viewport) = 'object'
      and jsonb_typeof(capture_options) = 'object'
      and jsonb_typeof(auth_config) = 'object'
    )
);

create unique index if not exists capture_jobs_current_key_idx
on public.capture_jobs (capture_key)
where status <> 'STALE';

create index if not exists capture_jobs_board_created_idx
on public.capture_jobs (board_id, created_at desc);

create index if not exists capture_jobs_queue_idx
on public.capture_jobs (status, queued_at)
where status = 'QUEUED';

drop trigger if exists capture_jobs_set_updated_at on public.capture_jobs;
create trigger capture_jobs_set_updated_at
before update on public.capture_jobs
for each row execute function public.set_updated_at();

alter table public.repository_capture_configs enable row level security;
alter table public.capture_jobs enable row level security;

-- Capture configuration can reference server-only environment-variable names. It is
-- intentionally available only through validated server routes using the service role.
-- Capture jobs are also mutated only by those routes and the worker.

create or replace function public.claim_next_capture_job(worker_name text)
returns setof public.capture_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_id uuid;
begin
  if coalesce(length(trim(worker_name)), 0) = 0 then
    raise exception 'worker_name is required';
  end if;

  update public.capture_jobs
  set status = 'FAILED', completed_at = now(), error_code = 'WORKER_LEASE_EXPIRED',
      error_message = 'The capture worker stopped before completing this job.'
  where status = 'RUNNING'
    and started_at < now() - interval '10 minutes';

  select id into job_id
  from public.capture_jobs
  where status = 'QUEUED'
  order by queued_at asc
  for update skip locked
  limit 1;

  if job_id is null then
    return;
  end if;

  return query
  update public.capture_jobs
  set status = 'RUNNING', claimed_by = worker_name, started_at = now(), error_code = null,
      error_message = null
  where id = job_id and status = 'QUEUED'
  returning *;
end;
$$;

revoke all on function public.claim_next_capture_job(text) from public, anon, authenticated;
grant execute on function public.claim_next_capture_job(text) to service_role;
