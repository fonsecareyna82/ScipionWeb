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
- `src/services/ProjectService.ts` + `src/ProjectServiceContext.tsx` — the main data-fetching/state layer for project data. HTTP API modules use `BASE_URL = "/api"` from `src/config.ts`; the tracked `.env` value alone does not establish the effective API URL.
- `src/adapters/`, `src/stores/` — data shaping and state management.
- `src/components/`, `src/pages/`, `src/layout/` — UI. Project workflow state lives in `src/pages/Dashboard/projects/ProjectPage.tsx`; the home dashboard lives in `src/pages/Dashboard/homepage/Home.tsx`.
- `src/components/protocol/` — forms, protocol actions, outputs, logs, and wizard dialogs. `src/utils/protocolform.*` implements shared form semantics.
  Form wizards run the plugin's own code on the server (`POST /projects/{id}/wizards/run`, `use_wizard_runtime`); the dialogs it opens come back described (`src/utils/protocol_wizard_runtime.ts`) and `WizardRuntimeDialog` renders each kind generically (confirm, choice, form, list, preview with images/sliders/rings, file, 3D point). There is no per-wizard UI.
- `src/components/analyze/` — metadata, CTF, volume, coordinate, and tomography viewers. Changes to request cancellation and caching must preserve isolation between viewer requests.
- `src/components/analyze/image-preview-dialog.tsx` — shared image detail window used by metadata and CTF previews (zoom, pan, rotation, brightness/contrast, external window). Callers provide an image loader; the dialog owns cancellation and object URL cleanup independently of thumbnail requests.
- `src/hooks/useProtocolLogs.ts` + `ProtocolLogsPanel.tsx` — log windows, history loading, global search, and full log copy.
- `src/hooks/`, `src/lib/`, `src/utils/`, `src/context/` — supporting code.
- Multiple Vite build targets, not just one app: `build:web` (the full app) and `build:widget:{list,page,protocoldetail}` (standalone embeddable widgets, each with its own `vite.project*.config.ts`) — check which mode you're actually building/testing against before assuming "the app" means the whole thing.

## Testing

- CI already exists: `.github/workflows/tests.yml` (Node 20.18.0, `npm ci && npm test`).
- **Run tests with `npm test`, which uses Vitest** (`vitest --config vitest.config.ts run`) — not Jest.
- Vitest uses `jsdom`, the `@` alias for `src`, and `src/test/setup.ts`. Tests live in `src/components/tests/`, alongside some source files, and in `src/test/`.
- For a focused regression, use `npm test -- <test-file>`; run `npm run build:web` when validating the app build, or the appropriate widget script for widget changes.
- `engines.node` is strictly pinned to `>=20.18.0 <21` (matches `.nvmrc`) — don't assume a newer/older Node works.

## Behavior to preserve

- ReactFlow node IDs are the canonical protocol identity; reject protocol detail responses that belong to another protocol.
- Output refreshes must preserve the displayed order by output name across graph, table and form updates. Append new outputs and remove absent ones; the output panel selection follows the output name, scoped to its project and protocol, rather than its array index.
- With output thumbnails enabled, graph nodes display scalar outputs as compact name/value rows, retaining drag-and-drop input behavior. With thumbnails disabled, scalars retain the standard output pills. Scalars do not consume thumbnail columns; mixed output layouts preserve the protocol's output order.
- Container resizing and routine graph refreshes (including those triggered by closing protocol forms) must preserve viewport pan and zoom in Grid and hierarchical views. Automatic centering is reserved for initial load and explicit layout/navigation actions.
- Restart/status refreshes must preserve correct elapsed sessions; retain the regression coverage in `src/components/tests/projects/` when changing workflow state.
- Home opens the last accessed project when available (`scipion.home.lastOpenedProjectId.v1` in localStorage), rather than choosing solely by update time.
- Log search and full copy must operate on the complete log through the service API, not just the currently loaded window.
- UI text and code comments use English.

## Known gotchas

- Vitest is the only test runner (Jest was removed). `@testing-library/jest-dom` is still a dependency on purpose — it provides DOM matchers for Vitest, not Jest itself.
- This repo is standalone/HTTP-only towards Scipion — if something looks like it needs a direct Python/Scipion import, that's a sign it belongs in `ScipionAPI` instead, not here.

## Keeping this document current

This file describes the repo as of the last time someone updated it — it will drift out of date as the code changes. If your change touches anything described above (stack, architecture map, testing setup, dependencies, gotchas), update the relevant section in this file as part of the same change, not as a separate follow-up. Don't wait to be asked.
