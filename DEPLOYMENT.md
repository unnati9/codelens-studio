# CodeLens Studio deployment

## Supabase

1. Create a Supabase project in the region nearest the demo venue.
2. Open the SQL Editor and run
   every file in `supabase/migrations` in filename order.
3. Confirm that `boards` and `board_nodes` appear in the Table Editor.
4. Confirm that the public `board-media` bucket appears in Storage with an 8 MB limit and PNG,
   JPEG, and WebP MIME restrictions.
5. Copy the project URL and anon key from Project Settings > API.

Do not copy or expose the service-role key. The application does not use it.

## Vercel or another Next.js host

1. Import this repository as a Next.js project.
2. Use `npm run build` as the build command and the default Next.js output settings.
3. Configure these production environment variables:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=board-media` (optional because this is the default)
   - `GITHUB_TOKEN` (optional, server-only, raises public GitHub API rate limits)
   - `GITHUB_PR_MAX_FILES=300` (optional)
   - `GITHUB_IMPORT_LIMIT=20` (optional)

4. Deploy the application.
5. Open `/api/health`. A successful deployment returns HTTP 200 with both `database` and `storage`
   set to `true`.

The application uses standard Next.js output and has no filesystem persistence, background worker,
microservice, or platform-specific runtime dependency. It can run on any host supporting Next.js 16
and Node.js 20.9 or newer. If configured, `GITHUB_TOKEN` must remain server-only.

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

## Known Day 1 limitations

- Guest IDs identify a browser installation; they are not authentication or authorization.
- Boards are link-accessible and writable under the prototype RLS policy.
- Replacing an uploaded image does not yet remove the old object from Storage.
- Playwright acceptance runs leave a uniquely named audit board and one code node in the database so
  the test never requires privileged cleanup credentials.
- Pending debounced changes should reach **Saved** before refreshing; browser unload cannot guarantee
  completion of an in-flight network request.
- Realtime updates and conflict handling begin on Day 2.
