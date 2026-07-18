create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  target_type text not null check (target_type in ('NODE', 'WORKSPACE')),
  target_node_id uuid references public.board_nodes(id) on delete cascade,
  tool text not null check (tool in ('FREEHAND', 'RECTANGLE', 'ARROW', 'HIGHLIGHT')),
  geometry jsonb not null,
  style jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annotations_target_check check (
    (target_type = 'NODE' and target_node_id is not null)
    or (target_type = 'WORKSPACE' and target_node_id is null)
  )
);

create index if not exists annotations_board_id_idx on public.annotations (board_id);
create index if not exists annotations_target_node_id_idx
on public.annotations (target_node_id)
where target_node_id is not null;

drop trigger if exists annotations_set_updated_at on public.annotations;
create trigger annotations_set_updated_at
before update on public.annotations
for each row execute function public.set_updated_at();

drop trigger if exists annotations_touch_parent on public.annotations;
create trigger annotations_touch_parent
after insert or update or delete on public.annotations
for each row execute function public.touch_parent_board();

alter table public.annotations enable row level security;

drop policy if exists "prototype annotations are readable" on public.annotations;
create policy "prototype annotations are readable"
on public.annotations for select
to anon, authenticated
using (true);

drop policy if exists "prototype annotations are creatable" on public.annotations;
create policy "prototype annotations are creatable"
on public.annotations for insert
to anon, authenticated
with check (created_by <> '');

drop policy if exists "prototype annotations are editable" on public.annotations;
create policy "prototype annotations are editable"
on public.annotations for update
to anon, authenticated
using (true)
with check (created_by <> '');

drop policy if exists "prototype annotations are deletable" on public.annotations;
create policy "prototype annotations are deletable"
on public.annotations for delete
to anon, authenticated
using (true);
