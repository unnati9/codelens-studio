# CodeLens Studio Development Rules

## Product objective

Build a reliable collaborative visual code-review prototype for a three-day hackathon.

## Primary acceptance gate

The project is not complete until the exact nine-step demo succeeds twice consecutively in the deployed application using two browser sessions.

## Priority order

1. Persistence
2. Correct annotation geometry
3. Realtime synchronization
4. Comment workflow
5. Demo reliability
6. Visual polish
7. Optional features

## Core rules

* Do not implement optional features before the primary acceptance gate passes.
* Do not add video before the main demo path is stable.
* Do not add GitHub integration.
* Do not add AI review features.
* Do not add microservices.
* Do not add complex authentication.
* Use guest identities.
* Keep the architecture simple.
* Keep client-only UI state separate from persisted state.
* Validate persisted records using Zod.
* Never expose Supabase service-role credentials to the client.
* Use relative annotation coordinates for node-targeted annotations.
* Node-targeted annotations must remain aligned after move, resize, pan, zoom, save, reload, and realtime synchronization.
* Avoid storing rendered viewport coordinates as persisted annotation coordinates.
* Debounce high-frequency position updates.
* Avoid realtime echo loops.
* Use optimistic UI carefully.
* Provide visible saving, saved, reconnecting, and failed states.
* Do not silently swallow errors.
* Do not rewrite unrelated files.
* Do not add dependencies without explaining their purpose.
* Prefer focused components and utilities.
* Preserve canvas interaction accessibility where practical.

## Completion requirements for every task

Before declaring a task complete:

* Run formatting.
* Run linting.
* Run TypeScript checking.
* Run relevant unit tests.
* Run relevant Playwright tests when applicable.
* Run the production build when the task affects deployment.
* List files changed.
* Explain important decisions.
* Report failing commands honestly.
* Document remaining limitations.
