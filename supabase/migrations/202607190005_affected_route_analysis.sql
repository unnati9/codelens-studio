create table if not exists public.repository_route_configs (
  id uuid primary key default gen_random_uuid(),
  github_owner text not null,
  github_repository text not null,
  route_mappings jsonb not null default '[]'::jsonb,
  dynamic_route_examples jsonb not null default '[]'::jsonb,
  routes_requiring_setup jsonb not null default '[]'::jsonb,
  ignored_routes jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repository_route_configs_normalized_repository_check
    check (github_owner = lower(github_owner) and github_repository = lower(github_repository)),
  constraint repository_route_configs_arrays_check
    check (
      jsonb_typeof(route_mappings) = 'array'
      and jsonb_typeof(dynamic_route_examples) = 'array'
      and jsonb_typeof(routes_requiring_setup) = 'array'
      and jsonb_typeof(ignored_routes) = 'array'
    ),
  unique (github_owner, github_repository)
);

drop trigger if exists repository_route_configs_set_updated_at
on public.repository_route_configs;
create trigger repository_route_configs_set_updated_at
before update on public.repository_route_configs
for each row execute function public.set_updated_at();

alter table public.repository_route_configs enable row level security;

drop policy if exists "prototype route configs are readable"
on public.repository_route_configs;
create policy "prototype route configs are readable"
on public.repository_route_configs for select
to anon, authenticated
using (true);

drop policy if exists "prototype route configs are creatable"
on public.repository_route_configs;
create policy "prototype route configs are creatable"
on public.repository_route_configs for insert
to anon, authenticated
with check (created_by <> '');

drop policy if exists "prototype route configs are editable"
on public.repository_route_configs;
create policy "prototype route configs are editable"
on public.repository_route_configs for update
to anon, authenticated
using (true)
with check (created_by <> '');

create table if not exists public.affected_route_analysis_cache (
  id uuid primary key default gen_random_uuid(),
  github_owner text not null,
  github_repository text not null,
  head_sha text not null,
  analysis_version integer not null,
  config_updated_at timestamptz,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affected_route_analysis_cache_normalized_repository_check
    check (github_owner = lower(github_owner) and github_repository = lower(github_repository)),
  constraint affected_route_analysis_cache_head_sha_check
    check (head_sha ~ '^[A-Fa-f0-9]{7,64}$'),
  constraint affected_route_analysis_cache_result_check
    check (jsonb_typeof(result) = 'object'),
  unique (github_owner, github_repository, head_sha)
);

drop trigger if exists affected_route_analysis_cache_set_updated_at
on public.affected_route_analysis_cache;
create trigger affected_route_analysis_cache_set_updated_at
before update on public.affected_route_analysis_cache
for each row execute function public.set_updated_at();

alter table public.affected_route_analysis_cache enable row level security;

drop policy if exists "prototype affected route cache is readable"
on public.affected_route_analysis_cache;
create policy "prototype affected route cache is readable"
on public.affected_route_analysis_cache for select
to anon, authenticated
using (true);

drop policy if exists "prototype affected route cache is creatable"
on public.affected_route_analysis_cache;
create policy "prototype affected route cache is creatable"
on public.affected_route_analysis_cache for insert
to anon, authenticated
with check (analysis_version > 0);

drop policy if exists "prototype affected route cache is editable"
on public.affected_route_analysis_cache;
create policy "prototype affected route cache is editable"
on public.affected_route_analysis_cache for update
to anon, authenticated
using (true)
with check (analysis_version > 0);

create index if not exists affected_route_analysis_cache_lookup_idx
on public.affected_route_analysis_cache (github_owner, github_repository, head_sha);
