alter table public.boards drop constraint if exists boards_status_check;
alter table public.boards
add constraint boards_status_check
check (status in ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'));

create table if not exists public.comment_threads (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  annotation_id uuid not null references public.annotations(id) on delete cascade,
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz,
  constraint comment_threads_resolution_check check (
    (status = 'OPEN' and resolved_by is null and resolved_at is null)
    or (status = 'RESOLVED' and resolved_by is not null and resolved_at is not null)
  )
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.comment_threads(id) on delete cascade,
  author_id text not null,
  author_name text not null check (char_length(author_name) between 1 and 120),
  body text not null check (char_length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists comment_threads_annotation_id_idx
on public.comment_threads (annotation_id);
create index if not exists comment_threads_board_id_idx
on public.comment_threads (board_id, updated_at desc);
create index if not exists comments_thread_id_idx
on public.comments (thread_id, created_at asc);

drop trigger if exists comment_threads_set_updated_at on public.comment_threads;
create trigger comment_threads_set_updated_at
before update on public.comment_threads
for each row execute function public.set_updated_at();

drop trigger if exists comment_threads_touch_parent on public.comment_threads;
create trigger comment_threads_touch_parent
after insert or update or delete on public.comment_threads
for each row execute function public.touch_parent_board();

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create or replace function public.touch_comment_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.comment_threads
  set updated_at = now()
  where id = coalesce(new.thread_id, old.thread_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists comments_touch_thread on public.comments;
create trigger comments_touch_thread
after insert or update or delete on public.comments
for each row execute function public.touch_comment_thread();

alter table public.comment_threads enable row level security;
alter table public.comments enable row level security;

drop policy if exists "prototype comment threads are readable" on public.comment_threads;
create policy "prototype comment threads are readable"
on public.comment_threads for select
to anon, authenticated
using (true);

drop policy if exists "prototype comment threads are creatable" on public.comment_threads;
create policy "prototype comment threads are creatable"
on public.comment_threads for insert
to anon, authenticated
with check (created_by <> '');

drop policy if exists "prototype comment threads are editable" on public.comment_threads;
create policy "prototype comment threads are editable"
on public.comment_threads for update
to anon, authenticated
using (true)
with check (created_by <> '');

drop policy if exists "prototype comments are readable" on public.comments;
create policy "prototype comments are readable"
on public.comments for select
to anon, authenticated
using (true);

drop policy if exists "prototype comments are creatable" on public.comments;
create policy "prototype comments are creatable"
on public.comments for insert
to anon, authenticated
with check (author_id <> '' and author_name <> '' and char_length(trim(body)) > 0);

drop policy if exists "prototype comments are editable" on public.comments;
create policy "prototype comments are editable"
on public.comments for update
to anon, authenticated
using (true)
with check (author_id <> '' and author_name <> '' and char_length(trim(body)) > 0);
