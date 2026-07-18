create extension if not exists pgcrypto;

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'IN_REVIEW', 'APPROVED')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_nodes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  type text not null check (type in ('code', 'image')),
  title text,
  position_x numeric not null,
  position_y numeric not null,
  width numeric not null check (width >= 240),
  height numeric not null check (height >= 180),
  z_index integer not null default 0,
  locked boolean not null default false,
  content jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_nodes_board_id_idx on public.board_nodes (board_id);
create index if not exists boards_updated_at_idx on public.boards (updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists boards_set_updated_at on public.boards;
create trigger boards_set_updated_at
before update on public.boards
for each row execute function public.set_updated_at();

drop trigger if exists board_nodes_set_updated_at on public.board_nodes;
create trigger board_nodes_set_updated_at
before update on public.board_nodes
for each row execute function public.set_updated_at();

create or replace function public.touch_parent_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.boards
  set updated_at = now()
  where id = coalesce(new.board_id, old.board_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists board_nodes_touch_parent on public.board_nodes;
create trigger board_nodes_touch_parent
after insert or update or delete on public.board_nodes
for each row execute function public.touch_parent_board();

alter table public.boards enable row level security;
alter table public.board_nodes enable row level security;

drop policy if exists "prototype boards are readable" on public.boards;
create policy "prototype boards are readable"
on public.boards for select
to anon, authenticated
using (true);

drop policy if exists "prototype boards are creatable" on public.boards;
create policy "prototype boards are creatable"
on public.boards for insert
to anon, authenticated
with check (created_by <> '');

drop policy if exists "prototype boards are editable" on public.boards;
create policy "prototype boards are editable"
on public.boards for update
to anon, authenticated
using (true)
with check (created_by <> '');

drop policy if exists "prototype nodes are readable" on public.board_nodes;
create policy "prototype nodes are readable"
on public.board_nodes for select
to anon, authenticated
using (true);

drop policy if exists "prototype nodes are creatable" on public.board_nodes;
create policy "prototype nodes are creatable"
on public.board_nodes for insert
to anon, authenticated
with check (created_by <> '');

drop policy if exists "prototype nodes are editable" on public.board_nodes;
create policy "prototype nodes are editable"
on public.board_nodes for update
to anon, authenticated
using (true)
with check (created_by <> '');

drop policy if exists "prototype nodes are deletable" on public.board_nodes;
create policy "prototype nodes are deletable"
on public.board_nodes for delete
to anon, authenticated
using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-media',
  'board-media',
  true,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "board media is publicly readable" on storage.objects;
create policy "board media is publicly readable"
on storage.objects for select
to public
using (bucket_id = 'board-media');

drop policy if exists "guests can upload board media" on storage.objects;
create policy "guests can upload board media"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'board-media');

drop policy if exists "guests can replace board media" on storage.objects;
create policy "guests can replace board media"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'board-media')
with check (bucket_id = 'board-media');

drop policy if exists "guests can remove board media" on storage.objects;
create policy "guests can remove board media"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'board-media');
