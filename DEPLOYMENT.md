# CodeLens Studio deployment

## Supabase

1. Create a Supabase project in the region nearest the demo venue.
2. Open the SQL Editor and run
   every file in `supabase/migrations` in filename order.
3. Confirm that `boards` and `board_nodes` appear in the Table Editor.
4. Confirm that `boards`, `board_nodes`, `annotations`, `comment_threads`, and `comments` are enabled
   in the `supabase_realtime` publication. The realtime migration performs this automatically.
5. Confirm that the public `board-media` bucket appears in Storage with an 8 MB limit and PNG,
   JPEG, and WebP MIME restrictions.
6. Copy the project URL and anon key from Project Settings > API.

Do not copy or expose the service-role key. The application does not use it.

## Vercel or another Next.js host

1. Import this repository as a Next.js project.
2. Use `npm run build` as the build command and the default Next.js output settings.
3. Configure these production environment variables:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=board-media` (optional because this is the default)
   - `GITHUB_TOKEN` (optional, server-only, raises public GitHub API rate limits)
   - `APP_URL` (the exact deployed origin, without a trailing slash)
   - `GITHUB_APP_CLIENT_ID` (server-only)
   - `GITHUB_APP_CLIENT_SECRET` (server-only)
   - `GITHUB_APP_SLUG` (the public slug used in the installation URL)
   - `GITHUB_SESSION_SECRET` (server-only random value of at least 32 bytes)
   - `GITHUB_APP_CALLBACK_URL` (optional; must equal
     `${APP_URL}/api/github/auth/callback` exactly)
   - `GITHUB_INSTALLATION_LIST_LIMIT=100` (optional)
   - `GITHUB_REPOSITORY_LIST_LIMIT=1000` (optional)
   - `GITHUB_OPEN_PR_LIST_LIMIT=300` (optional)
   - `GITHUB_PR_MAX_FILES=300` (optional)
   - `GITHUB_IMPORT_LIMIT=20` (optional)

4. Deploy the application.
5. Open `/api/health`. A successful deployment returns HTTP 200 with both `database` and `storage`
   set to `true`.

The application uses standard Next.js output and has no filesystem persistence, background worker,
microservice, or platform-specific runtime dependency. It can run on any host supporting Next.js 16
and Node.js 20.9 or newer. If configured, `GITHUB_TOKEN` must remain server-only.

Realtime collaboration needs no additional environment variable. It uses the existing public
Supabase URL and publishable/anon key under the same prototype Row Level Security policies.

## GitHub App setup

1. Create a GitHub App with user authorization enabled and expiring user access tokens enabled.
2. Set repository permission **Pull requests** to **Read-only**. GitHub includes the mandatory
   **Metadata: Read-only** permission automatically. Leave Contents, Checks, Administration, and all
   write permissions disabled. Webhooks are not required for this phase.
3. Register `http://localhost:3000/api/github/auth/callback` for local development and
   `https://codelens-studio.vercel.app/api/github/auth/callback` for production, replacing the origin
   if the deployment uses another domain.
4. Install the app on only the repositories needed for review. The authorizing GitHub user must also
   have access to those repositories.
5. Configure the server-only variables listed above in every Vercel environment. Set `APP_URL` to the
   stable environment origin; callback validation is exact.

The app uses signed, short-lived OAuth state with PKCE and stores encrypted GitHub user tokens only in
an HttpOnly cookie. The browser never receives access tokens or client secrets. Linking and syncing a
board verifies the selected installation and repository again on the server before persistence.

The `202607190003_github_repository_integration.sql` migration extends boards with branch, SHA,
author, title, description, changed-file-count, and sync-time metadata. Run it after the earlier
migrations. Existing manual boards and nodes remain valid because all new columns are nullable.

## Day 1 acceptance gate

Run this check against the deployed URL, not only localhost:

1. Open `/boards` and create a named board.
2. Open the board and add one code node.
3. Add one image node and upload a PNG, JPEG, or WebP screenshot.
4. Drag both nodes by their headers.
5. Select each node and resize it using a corner handle.
6. Change the code title, filename, language, and source text.
7. Wait until the top bar says **Saved**.
8. Refresh the page.
9. Confirm the code, image, positions, dimensions, and front-to-back order are restored.
10. Open `/boards` and confirm the board has a recent updated time.

If the save indicator reports a failure, do not refresh. Hover it for the database or storage error,
fix the configuration or connection, and retry the edit.

### Automated production audit

Set the deployed URL and run the Playwright acceptance path:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://your-deployed-app.example"
npm run test:e2e
```

The test first requires `/api/health` to report working database and storage connections. It then
creates a uniquely named board, uploads a generated PNG fixture, moves and resizes both node types,
reloads, checks persisted content and geometry, verifies direct board navigation, injects a failed
save to check the visible error state, and confirms deletion survives a reload. It does not use a
service-role key or delete pre-existing user data.

## Known prototype limitations

- Guest IDs identify a browser installation; they are not authentication or authorization.
- Boards are link-accessible and writable under the prototype RLS policy.
- Replacing an uploaded image does not yet remove the old object from Storage.
- Playwright acceptance runs leave a uniquely named audit board and one code node in the database so
  the test never requires privileged cleanup credentials.
- Pending debounced changes should reach **Saved** before refreshing; browser unload cannot guarantee
  completion of an in-flight network request.
- Postgres DELETE events cannot be server-filtered by Supabase Realtime. The client listens for
  delete primary keys and only removes IDs already present in the active board stores; reconnect
  reconciliation provides a second consistency check.
- Collaboration uses row-level last-write-wins timestamps, not character-level merging. Concurrent
  edits to the same record resolve to the latest committed database row.
- Private repositories are visible in the selector but cannot be linked or imported while prototype
  board and node policies allow anonymous reads. Public RLS must be replaced before private code can
  be stored safely.
- GitHub synchronization is manual. This phase has no webhooks, preview-deployment discovery,
  screenshot capture, route analysis, GitHub Checks, or AI review.
- Disconnecting clears the local encrypted GitHub session; it does not uninstall the GitHub App or
  revoke its authorization on GitHub.
