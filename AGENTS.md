# ScipionWeb — developer manual for AI agents

Read this before making changes here. Written for an AI coding agent, not end users — see `README.rst` for that.

For deeper, less-frequently-needed context, see:
- [`.ai/tech-debt.md`](.ai/tech-debt.md) — known problem areas
- [`.ai/roadmap.md`](.ai/roadmap.md) — planned/likely future work (draft, pending team review)
- [`.ai/protocol-form-compatibility.md`](.ai/protocol-form-compatibility.md) — how protocol forms must mirror Scipion's form semantics (path params, conditions, expert level); read before touching `ProtocolForm`

## What this repo is

The new React-based frontend for Scipion, replacing both the legacy Tkinter desktop GUI and an intermediate NiceGUI attempt (the README only mentions NiceGUI — both are accurate, NiceGUI was a stepping stone that didn't ship). Talks to `ScipionAPI` purely over HTTP — the one genuinely isolated repo in the 5-repo ecosystem (no direct Python imports of `pyworkflow`/`pwem`/etc.).

## Stack

React 18 + TypeScript + Vite, TailwindCSS v4 + ShadCN/UI, ReactFlow (protocol workflow graphs), Axios, React Query. The app was originally built on the TailAdmin dashboard template, so some template leftovers remain — e.g. `src/components/ecommerce/` is not imported anywhere (and is the only user of `@react-jvectormap`). Don't treat template code as part of the Scipion app.

## Architecture map

- `src/api/` — HTTP calls to ScipionAPI (`auth.ts`, `projects.ts`, `protocols.ts`, `plugins.ts`, `settings.ts`, `users.ts`).
- `src/services/ProjectService.ts` + `src/ProjectServiceContext.tsx` — the main data-fetching/state layer for project data, reads `VITE_API_URL` from `.env` (tracked in git, contains only `VITE_API_URL="http://localhost:8080/api"`, no secrets).
- `src/adapters/`, `src/stores/` — data shaping and state management.
- `src/components/`, `src/pages/`, `src/layout/` — UI.
- `src/hooks/`, `src/lib/`, `src/utils/`, `src/context/` — supporting code.
- Multiple Vite build targets, not just one app: `build:web` (the full app) and `build:widget:{list,page,protocoldetail}` (standalone embeddable widgets, each with its own `vite.project*.config.ts`) — check which mode you're actually building/testing against before assuming "the app" means the whole thing.

## Testing

- CI already exists: `.github/workflows/tests.yml` (Node 20.18.0, `npm ci && npm test`).
- **Run tests with `npm test`, which uses Vitest** (`vitest --config vitest.config.ts run`) — not Jest.
- `engines.node` is strictly pinned to `>=20.18.0 <21` (matches `.nvmrc`) — don't assume a newer/older Node works.

## Known gotchas

- Vitest is the only test runner (Jest was removed). `@testing-library/jest-dom` is still a dependency on purpose — it provides DOM matchers for Vitest, not Jest itself.
- This repo is standalone/HTTP-only towards Scipion — if something looks like it needs a direct Python/Scipion import, that's a sign it belongs in `ScipionAPI` instead, not here.

## Keeping this document current

This file describes the repo as of the last time someone updated it — it will drift out of date as the code changes. If your change touches anything described above (stack, architecture map, testing setup, dependencies, gotchas), update the relevant section in this file as part of the same change, not as a separate follow-up. Don't wait to be asked.
