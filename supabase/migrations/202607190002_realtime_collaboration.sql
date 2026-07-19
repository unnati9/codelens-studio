alter table public.comments
add column if not exists board_id uuid;

update public.comments as comment
set board_id = thread.board_id
from public.comment_threads as thread
where comment.thread_id = thread.id
  and comment.board_id is null;

alter table public.comments
alter column board_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'comments_board_id_fkey'
      and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
    add constraint comments_board_id_fkey
    foreign key (board_id) references public.boards(id) on delete cascade;
  end if;
end
$$;

create index if not exists comments_board_id_idx
on public.comments (board_id, updated_at desc);

create or replace function public.set_comment_board_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_board_id uuid;
begin
  select board_id
  into parent_board_id
  from public.comment_threads
  where id = new.thread_id;

  if parent_board_id is null then
    raise exception 'Comment thread % does not exist', new.thread_id;
  end if;

  new.board_id = parent_board_id;
  return new;
end;
$$;

drop trigger if exists comments_set_board_id on public.comments;
create trigger comments_set_board_id
before insert or update of thread_id, board_id on public.comments
for each row execute function public.set_comment_board_id();

alter table public.boards replica identity full;
alter table public.board_nodes replica identity full;
alter table public.annotations replica identity full;
alter table public.comment_threads replica identity full;
alter table public.comments replica identity full;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'boards',
      'board_nodes',
      'annotations',
      'comment_threads',
      'comments'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end
$$;
