alter table public.boards
add column if not exists source_type text,
add column if not exists github_owner text,
add column if not exists github_repository text,
add column if not exists github_pull_request_number integer,
add column if not exists github_pull_request_url text,
add column if not exists github_head_sha text,
add column if not exists last_imported_at timestamptz;

alter table public.boards drop constraint if exists boards_source_type_check;
alter table public.boards
add constraint boards_source_type_check
check (source_type is null or source_type = 'GITHUB_PR');

alter table public.boards drop constraint if exists boards_github_source_check;
alter table public.boards
add constraint boards_github_source_check
check (
  source_type is null
  or (
    github_owner is not null
    and github_repository is not null
    and github_pull_request_number > 0
    and github_pull_request_url is not null
    and github_head_sha is not null
    and last_imported_at is not null
  )
);

create index if not exists boards_github_source_idx
on public.boards (github_owner, github_repository, github_pull_request_number)
where source_type = 'GITHUB_PR';

create unique index if not exists board_nodes_github_source_key_idx
on public.board_nodes (board_id, (content #>> '{source,sourceKey}'))
where content #>> '{source,sourceKey}' is not null;
