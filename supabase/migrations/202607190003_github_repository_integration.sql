alter table public.boards
add column if not exists github_base_branch text,
add column if not exists github_head_branch text,
add column if not exists github_base_sha text,
add column if not exists github_author_login text,
add column if not exists github_pull_request_title text,
add column if not exists github_pull_request_description text,
add column if not exists github_changed_file_count integer,
add column if not exists github_last_synced_at timestamptz;

alter table public.boards drop constraint if exists boards_github_changed_file_count_check;
alter table public.boards
add constraint boards_github_changed_file_count_check
check (github_changed_file_count is null or github_changed_file_count >= 0);

-- Linking a board to a pull request is allowed before any files are imported.
-- The import timestamp therefore remains nullable and is not part of this constraint.
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
  )
);
