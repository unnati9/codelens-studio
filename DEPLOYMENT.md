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
6. Copy the project URL, anon key, and service-role key from Project Settings > API.

The capture job APIs and worker use the service-role key only on trusted server runtimes. Never put
it in browser code, client logs, or a variable with a `NEXT_PUBLIC_` prefix.

## Vercel or another Next.js host

1. Import this repository as a Next.js project.
2. Use `npm run build` as the build command and the default Next.js output settings.
3. Configure these production environment variables:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; required for capture configuration and job APIs)
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
   - `VERCEL_TOKEN` (server-only; required for Vercel preview discovery and connection tests)
   - `AFFECTED_ROUTE_MAX_DEPTH=8` (optional; hard cap 20)
   - `AFFECTED_ROUTE_MAX_FILES=300` (optional; hard cap 1000)
   - `AFFECTED_ROUTE_MAX_FILE_SIZE_BYTES=200000` (optional; hard cap 500000)
   - `AFFECTED_ROUTE_TIMEOUT_MS=8000` (optional; hard cap 12000)

4. Deploy the application.
5. Open `/api/health`. A successful deployment returns HTTP 200 with both `database` and `storage`
   set to `true`.

The web application uses standard Next.js output and no filesystem persistence. Automatic capture
adds one separately deployed Node worker with a Playwright Chromium runtime; it shares Supabase with
the web app and is not a public service. The web app can run on any host supporting Next.js 16 and
Node.js 20.9 or newer. All server tokens must remain server-only.

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

## Vercel preview provider setup

1. Apply `202607190004_preview_deployment_discovery.sql` after the existing migrations. It creates
   repository-level provider configuration and adds nullable deployment-result fields to `boards`.
2. Create a Vercel access token for an account that can read the deployed project. Add it to the host
   as the server-only `VERCEL_TOKEN`; do not prefix it with `NEXT_PUBLIC_`.
3. On a GitHub-linked CodeLens board, open **Preview** and enter the Vercel project ID from the
   Vercel project's **Settings > General** page. For team-scoped projects, also enter the team ID.
4. Enter the stable public production URL, enable discovery, and choose **Test connection**. Save the
   repository configuration, then choose **Refresh deployment** as needed.

CodeLens uses Vercel's deployment API and matches the PR head SHA first, with branch as a fallback.
Queued and building deployments are polled only while their board is open. API requests have a
12-second timeout, reject redirects, and are limited to `https://api.vercel.com`; discovered URLs
must be public HTTPS URLs except for localhost during local development. CodeLens does not request a
protected preview page and does not bypass Vercel Deployment Protection.

If no deployment is found, the token lacks access, or Vercel reports a failure, the board shows the
reason and the existing manual screenshot upload remains available. The preview provider does not
capture a preview, render it in an iframe, compare images, analyze routes, or publish GitHub Checks.

## Affected-route analyzer setup

Apply `202607190005_affected_route_analysis.sql` after the preview-deployment migration. It creates:

- `repository_route_configs` for route mappings, dynamic examples, routes requiring setup, and
  ignored routes.
- `affected_route_analysis_cache` for validated results keyed by repository and head SHA.

No additional secret is required. The analyzer uses the existing server-side `GITHUB_TOKEN` when it
is available. Configure that token for reliable GitHub API capacity; it must never have a
`NEXT_PUBLIC_` prefix. Linked private repositories remain unsupported under the prototype's public
board policies.

The default limits are 8 dependency levels, 300 source files, 200,000 bytes per source file, and an
8-second source-loading and traversal budget. The optional `AFFECTED_ROUTE_*` variables listed above
can adjust those values within hard caps. After deployment, open a GitHub-linked board, choose
**Affected UI**, confirm the framework and routes, add a concrete example for each dynamic route,
and record setup instructions for routes that require state or seeded data.

The analyzer handles static TypeScript, JavaScript, JSX, and TSX dependency patterns for Next.js App
Router, Next.js Pages Router, and common React Router declarations. It does not execute repository
code, follow computed imports, interpret custom bundler alias plugins, infer routes with AI, or
create visual diffs.

## Playwright capture worker setup

1. Apply `202607190006_playwright_capture_jobs.sql` after the affected-route migration. It creates
   repository capture configuration, persistent jobs, the one-current-job uniqueness rule, and an
   atomic service-role-only queue claim function.
2. Add `SUPABASE_SERVICE_ROLE_KEY` to both the web server and worker as a server-only secret. Capture
   configuration and job routes use it because those tables intentionally have no guest RLS
   policies. Never add a `NEXT_PUBLIC_` prefix or print this key.
3. Deploy a trusted Node worker from the same revision. Install dependencies and Chromium, then run:

   ```text
   npm ci
   npx playwright install --with-deps chromium
   npm run capture:worker
   ```

   `npm run capture:once` is available for a one-job scheduler. The continuous worker polls every two
   seconds by default; tune `CAPTURE_POLL_INTERVAL_MS` and set a stable `CAPTURE_WORKER_NAME` for
   observability. A container with at least 1 GB memory is recommended. The worker always closes each
   browser context and browser, including failure and timeout paths. The atomic claim also marks a
   Running job Failed when its worker lease has been abandoned for ten minutes, making it retryable.

4. In **Affected UI > Deterministic capture settings**, save viewports and any readiness, locale,
   timezone, color, masking, hiding, or timeout values. Add concrete dynamic-route examples in
   repository fallbacks before selecting those routes.
5. For authenticated pages, put Playwright storage-state JSON (or base64-encoded JSON) in a worker
   secret such as `CODELENS_CAPTURE_STORAGE_STATE` and save only that variable name, or save
   repository login steps. A fill step has the form
   `{"action":"fill","selector":"input[type=email]","valueEnv":"CODELENS_CAPTURE_TEST_EMAIL"}`.
   Goto, click, and waitFor steps are also supported. Put each referenced credential only in the
   worker environment. Use a least-privilege test account with non-production data.

The worker captures a base and PR full page plus base and PR viewport for each route/viewport job. It
stores PNGs in the existing `board-media` bucket, creates four normal image nodes, and records final
URLs, main-document HTTP statuses, console/page errors, failed network requests, viewport metadata,
artifact sizes, and durations. Jobs become Stale if the board SHA or deployment URLs change before
execution.

Capture security is bounded: initial URLs, redirects, and every HTTP(S) subresource are DNS-checked
against private, loopback, link-local, multicast, documentation, and other special-use IP ranges;
URL credentials and non-HTTPS production targets are rejected. Each page is limited to 5 redirects,
250 requests, 25 MB of network transfer, 20,000 CSS pixels per dimension, 40 million CSS pixels
total, the configured timeout (hard-capped at 120 seconds per target), and the existing 8 MB
per-object storage limit. Service workers and downloads are disabled. `CAPTURE_ALLOW_LOCALHOST=true`
exists only for deterministic local fixture tests and must never be enabled in production.

Current limitations: capture targets must be publicly reachable by the worker; protected deployment
front doors need ordinary storage state or repository login setup; pages larger than the safety or
storage caps fail instead of being tiled; masks are solid Playwright masks; login setup supports a
small deterministic action set; only queued jobs can be cancelled; and there is no pixel diff,
changed-region detection, source mapping, or GitHub Checks.

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
- GitHub synchronization and deployment refresh are manual entry points; only queued and building
  deployment states poll while a board is open. Capture jobs require the separately deployed worker.
  There are no webhooks, iframe previews, pixel diffs, changed-region detection, source mapping,
  GitHub Checks, or AI review.
- Preview discovery supports Vercel only. It cannot discover projects the configured token cannot
  read, and it does not bypass Vercel Deployment Protection.
- Affected-route analysis uses bounded static import heuristics. Dynamic imports, runtime route
  construction, custom alias plugins, deeply nested monorepo app roots, and removed-file dependency
  chains may require repository fallback mappings.
- Disconnecting clears the local encrypted GitHub session; it does not uninstall the GitHub App or
  revoke its authorization on GitHub.
