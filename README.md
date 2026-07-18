# CodeLens Studio

CodeLens Studio is a desktop-first spatial workspace for comparing source code with the UI it
produces. This repository implements durable boards, editable code nodes, uploaded image nodes,
movable and resizable React Flow layouts, and a tracing-paper annotation layer backed by Supabase.

Comments, realtime subscriptions, presence, video, GitHub integration, and AI features are
intentionally not included in this milestone.

## Stack and dependency purpose

- Next.js App Router and React provide the routes and application UI.
- TypeScript keeps canvas and database records aligned.
- Tailwind CSS provides the interface styling.
- React Flow provides canvas pan, zoom, node movement, and resizing.
- A custom SVG overlay provides freehand, rectangle, arrow, and highlight annotations without an
  additional drawing dependency.
- Supabase Postgres and Storage provide durable board state and uploaded images.
- Zod validates every database record at the data boundary.
- Zustand separates the persisted board mirror from transient selection and save-state UI.
- Vitest covers serialization, validation, and debounced persistence.

## Local setup

Requirements: Node.js 20.9 or newer, npm, and a Supabase project.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the Supabase project URL and public anon key to `.env.local`.
4. Apply the SQL files in `supabase/migrations` in filename order using the Supabase SQL Editor or
   Supabase CLI.
5. Start the app with `npm run dev` and open `http://localhost:3000`.

The migrations create the `boards`, `board_nodes`, and `annotations` tables, their update triggers
and indexes, the public `board-media` storage bucket, and prototype Row Level Security policies.

## Annotation coordinate model

Workspace annotations are stored in React Flow coordinates, so panning and zooming only affect
their rendered screen position. Node annotations are stored as normalized values from 0 to 1
relative to the target node. Points, rectangle dimensions, freehand pairs, and arrow endpoints are
denormalized from the node's current position and size every time the overlay renders. This keeps
ink aligned after node movement, resize, save/reload, and later store updates from realtime events.

The browser receives only `NEXT_PUBLIC_SUPABASE_URL` and a public Supabase API key. Current projects
can use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` name is
also supported. Never add a Supabase service-role key to a `NEXT_PUBLIC_` variable.

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
