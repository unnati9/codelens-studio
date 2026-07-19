# CodeLens Studio

CodeLens Studio is a desktop-first spatial workspace for comparing source code with the UI it
produces. This repository implements durable boards, editable code nodes, uploaded image nodes,
movable and resizable React Flow layouts, a tracing-paper annotation layer, linked review comments,
GitHub App repository and pull-request integration, read-only public pull-request import, and
board-scoped realtime collaboration backed by Supabase.

Video, private-repository import, and AI features are intentionally not included in this milestone.

## Stack and dependency purpose

- Next.js App Router and React provide the routes and application UI.
- TypeScript keeps canvas and database records aligned.
- Tailwind CSS provides the interface styling.
- React Flow provides canvas pan, zoom, node movement, and resizing.
- A custom SVG overlay provides freehand, rectangle, arrow, and highlight annotations without an
  additional drawing dependency.
- Supabase Postgres, Realtime, Presence, and Storage provide durable board state, live updates,
  connected-reviewer presence, and uploaded images.
- Zod validates every database record at the data boundary.
- Zustand separates the persisted board mirror from transient selection and save-state UI.
- Vitest covers serialization, validation, and debounced persistence.
- A server-only GitHub REST client lists authorized repositories, links pull requests, and imports
  selected patches without exposing tokens to the browser.
- A server-only Vercel provider discovers production and pull-request preview deployments without
  fetching or bypassing protected preview pages.

## Local setup

Requirements: Node.js 20.9 or newer, npm, and a Supabase project.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the Supabase project URL and public anon key to `.env.local`.
4. Apply the SQL files in `supabase/migrations` in filename order using the Supabase SQL Editor or
   Supabase CLI.
5. Start the app with `npm run dev` and open `http://localhost:3000`.

The migrations create the board, node, annotation, comment-thread, and comment records, their
update triggers and indexes, the public `board-media` storage bucket, prototype Row Level Security
policies, repository preview configuration, and the Realtime publication entries used by
collaboration.

## Annotation coordinate model

Workspace annotations are stored in React Flow coordinates, so panning and zooming only affect
their rendered screen position. Node annotations are stored as normalized values from 0 to 1
relative to the target node. Points, rectangle dimensions, freehand pairs, and arrow endpoints are
denormalized from the node's current position and size every time the overlay renders. This keeps
ink aligned after node movement, resize, save/reload, and later store updates from realtime events.

The browser receives only `NEXT_PUBLIC_SUPABASE_URL` and a public Supabase API key. Current projects
can use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` name is
also supported. Never add a Supabase service-role key to a `NEXT_PUBLIC_` variable.

## GitHub repository and pull-request integration

CodeLens can connect to a GitHub App using GitHub's user authorization flow. On a board, choose
**GitHub**, connect the app, select an accessible repository, and select one of its open pull
requests. Linking records the repository, pull-request number, branches, base and head SHAs, author,
title, description, changed-file count, and last sync time without adding files to the canvas.

The changed-file drawer lets the reviewer explicitly choose files to add as the existing CodeNode
type. A stable key prevents duplicate imports for the same board, repository, pull request, head SHA,
and filename. **Sync PR** detects a new head SHA and marks nodes imported from older revisions as
stale; it does not delete or replace manual or imported nodes. The reviewer then chooses which
updated files to add.

Create a GitHub App with user authorization enabled and expiring user access tokens enabled. Grant
only repository **Pull requests: Read-only**; GitHub also grants mandatory **Metadata: Read-only**.
No Contents, Checks, write, webhook, organization, or account permission is required. Register these
callback URLs for the relevant environment:

- Local: `http://localhost:3000/api/github/auth/callback`
- Production: `https://codelens-studio.vercel.app/api/github/auth/callback` (replace the origin when
  deploying elsewhere)

Set `APP_URL`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`, and a random
`GITHUB_SESSION_SECRET` of at least 32 bytes. `GITHUB_APP_CALLBACK_URL` is optional; when present, it
must exactly equal `${APP_URL}/api/github/auth/callback`. All GitHub credentials are server-only and
must not have a `NEXT_PUBLIC_` prefix. Access and refresh tokens are encrypted in an HttpOnly,
SameSite=Lax cookie and refreshed server-side.

Repositories must be installed for the GitHub App and accessible to the authorizing user. Private
repositories are shown but disabled because this prototype's Supabase policies make boards publicly
readable and writable; persisting private patches would be unsafe without first replacing that access
model.

## Public GitHub pull-request URL fallback

On a board, choose **GitHub**, paste a URL in the form
`https://github.com/{owner}/{repository}/pull/{pullNumber}`, inspect the changed files, and select up
to the configured import limit. Imported files use the existing code-node type and persist their
source metadata inside `board_nodes.content`. Matching source keys are skipped instead of duplicated.

Public imports work without GitHub authentication when API capacity is available. `GITHUB_TOKEN` is
an optional server-only token that raises rate limits. `GITHUB_PR_MAX_FILES` defaults to 300 and
controls how many changed files are inspected; `GITHUB_IMPORT_LIMIT` defaults to 20 and controls how
many files can become nodes in one action. None of these variables may use a `NEXT_PUBLIC_` prefix.

For a controlled connected test, install the GitHub App on a test repository and open a small public
PR containing one `.ts` or `.tsx` change and optionally one binary or lock-file change. Connect from a
manual board, link that PR, and confirm no nodes are added until files are selected. Import one source
file, annotate its code node, attach and resolve a comment, wait for **Saved**, and reload. Push a new
commit to the PR, choose **Sync PR**, and confirm the prior imported node is marked stale while the
manual board content remains intact. Re-select the updated file and confirm a new revision can be
added without duplicating the old source key.

## Vercel preview deployment discovery

GitHub-linked boards can discover a Vercel preview without requiring each pull-request author to
paste a URL. Open **Preview** in the board toolbar, enter the repository's Vercel project ID,
optional team ID, and public production URL, then use **Test connection** and **Save configuration**.
The configuration is stored once per GitHub repository and reused by its linked boards. Manual boards
and the existing screenshot upload remain available.

Set `VERCEL_TOKEN` in the server environment to a Vercel token that can read the configured project
and team. It is never returned to the browser or stored in Supabase. CodeLens queries only the fixed
Vercel API origin, rejects redirects, applies a request timeout, and validates discovered URLs as
public HTTPS URLs. Local HTTP is accepted only during development. Deployment Protection is not
bypassed; a protected preview must be opened using the reviewer's normal Vercel access.

Discovery first asks Vercel for the pull request's head commit SHA and falls back to the head branch
only when no SHA deployment exists. Statuses are Queued, Building, Ready, Failed, Cancelled, Not
found, and Access required. Queued and Building results are polled with bounded backoff while the
board is open. A GitHub **Sync PR** that detects a new head SHA marks the previous preview result old
and prompts a new refresh instead of presenting the old preview as current.

The Vercel project ID is available in the project's **Settings > General** page. Add the team ID only
for a team-scoped project. Use the stable production domain (for example,
`https://codelens-studio.vercel.app`) as the production URL.

## Realtime collaboration

Every open board subscribes to validated Postgres changes for that board. Node, annotation, review,
comment, and board-status events update the local stores without calling persistence again. Database
`updated_at` values provide last-write-wins ordering; stale events are ignored and identical local
echoes are suppressed. Node movement and resize remain debounced during interaction, then flush
immediately on pointer-up.

Presence uses a unique ID per open browser tab and publishes the guest name plus current node and
annotation selection. Presence is ephemeral; it is never stored in the database. Pan, zoom,
selection, open panels, annotation-tool settings, and draft comment text remain local to each tab.

On reconnect, failed node and annotation saves are retried before the active board is refetched and
reconciled. The top bar distinguishes connecting, connected, reconnecting, offline, and failed
states and never labels disconnected work as fully synchronized.

## Commands

```text
npm run format        Format source and documentation
npm run format:check  Verify formatting without changing files
npm run lint          Run ESLint
npm run typecheck     Run strict TypeScript checking
npm test              Run unit tests
npm run test:e2e      Run the Day 1 Playwright acceptance test
npm run build         Create a production build
npm start             Run the production build
```

## Prototype access model

Each browser gets a stable generated guest ID and display name in local storage. There is no login
flow. For hackathon reliability, the migration allows anonymous visitors to read and modify boards
and board media. Do not use these policies for private or production customer data.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the hosted setup and Day 1 verification checklist.
