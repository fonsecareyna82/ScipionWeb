# ScipionWeb — developer manual for AI agents

Read this before making changes here. Written for an AI coding agent, not end users — see `README.rst` for that.

For deeper, less-frequently-needed context, see:
- [`.ai/tech-debt.md`](.ai/tech-debt.md) — known problem areas
- [`.ai/roadmap.md`](.ai/roadmap.md) — planned/likely future work (draft, pending team review)

## What this repo is

The new React-based frontend for Scipion, replacing both the legacy Tkinter desktop GUI and an intermediate NiceGUI attempt (the README only mentions NiceGUI — both are accurate, NiceGUI was a stepping stone that didn't ship). Talks to `ScipionAPI` purely over HTTP — the one genuinely isolated repo in the 5-repo ecosystem (no direct Python imports of `pyworkflow`/`pwem`/etc.).

## Stack

React 18 + TypeScript + Vite, TailwindCSS v4 + ShadCN/UI, ReactFlow (protocol workflow graphs), Axios, React Query. **`package.json`'s `name` field is still `"tailadmin-react"`** — a leftover from the admin-dashboard template this was built on. Don't take package metadata at face value; the repo is ScipionWeb.

## Architecture map

- `src/api/` — HTTP calls to ScipionAPI (`auth.ts`, `projects.ts`, `protocols.ts`, `plugins.ts`, `settings.ts`).
- `src/services/ProjectService.ts` + `src/ProjectServiceContext.tsx` — the main data-fetching/state layer for project data, reads `VITE_API_URL` from `.env` (tracked in git, contains only `VITE_API_URL="http://localhost:8080/api"`, no secrets).
- `src/adapters/`, `src/stores/` — data shaping and state management.
- `src/components/`, `src/pages/`, `src/layout/` — UI.
- `src/hooks/`, `src/lib/`, `src/utils/`, `src/context/` — supporting code.
- `src/components/protocol/ProtocolForm.tsx` renders a protocol form generically from the JSON ScipionAPI's `protocol_form_serializer.py` sends — param type dispatch is by exact string match on `paramClass` (e.g. `defClass === "EnumParam"`). `pyworkflow.protocol.params.KeyedEnumParam` (backend-side, used by `Domain.findCapabilityProviders`-driven choice lists — see `scipion-pyworkflow`'s `.ai/capability-providers.md`) reuses `EnumParam`'s widget (`renderEnumParamRow`) but its `choices` serialize as `[key, label]` pairs instead of a flat label array, and its value is the selected key string, not a positional index — `src/utils/protocolform.utils.ts`'s `normalizeEnumOptions` handles both shapes (see its dedicated test, `protocolform.utils.test.ts`). Every `defClass === "EnumParam"`/`cls === "EnumParam"` check that also gates on `def.choices`/`current.choices` needs the matching `"KeyedEnumParam"` branch alongside it — `getConditionStateValue` (condition evaluation) is the one exception, since its generic fallthrough already returns the raw key string correctly without a dedicated branch.
- Multiple Vite build targets, not just one app: `build:web` (the full app) and `build:widget:{list,page,protocoldetail}` (standalone embeddable widgets, each with its own `vite.project*.config.ts`) — check which mode you're actually building/testing against before assuming "the app" means the whole thing.

## Testing

- CI already exists: `.github/workflows/tests.yml` (Node 20.18.0, `npm ci && npm test`).
- **Run tests with `npm test`, which uses Vitest** (`vitest --config vitest.config.ts run`) — not Jest.
- `engines.node` is strictly pinned to `>=20.18.0 <21` (matches `.nvmrc`) — don't assume a newer/older Node works.

## Known gotchas

- **Two test runners are configured simultaneously**: both `jest.config.js` and `vitest.config.ts` exist, with `jest`/`babel-jest` and `vitest` both in `devDependencies`. Only vitest is actually wired to `npm test`; `jest.config.js` appears vestigial. Don't run `npx jest` expecting it to reflect the real test suite — use `npm test`.
- `package.json`'s `name: "tailadmin-react"` (see Stack above) is cosmetic leftover, not a sign this is still template code — check `src/` for the real app structure instead of trusting the manifest name.
- This repo is standalone/HTTP-only towards Scipion — if something looks like it needs a direct Python/Scipion import, that's a sign it belongs in `ScipionAPI` instead, not here.

## Keeping this document current

This file describes the repo as of the last time someone updated it — it will drift out of date as the code changes. If your change touches anything described above (stack, architecture map, testing setup, dependencies, gotchas), update the relevant section in this file as part of the same change, not as a separate follow-up. Don't wait to be asked.
