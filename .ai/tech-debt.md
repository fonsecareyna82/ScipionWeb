# Tech debt — ScipionWeb

Findings from a real audit of this repo (2026-08-04), not a wishlist.

## No `.py` audit performed here

This session's tech-debt audit (TODO/FIXME counts, largest-file scan) used Python-oriented tooling and found effectively nothing in this repo's own code (only `node_modules` matches, which are irrelevant). If a real JS/TS-specific debt audit is wanted later, it needs its own pass (e.g. grepping `.ts`/`.tsx` for TODO/FIXME, checking bundle size, largest components) - not done as part of this round.

## Current observations (verified 2026-10-11)

- Large files concentrate several responsibilities: `ProjectPage.tsx` (10,819 lines), `ProtocolForm.tsx` (5,250), `volume-viewer.tsx` (5,801), and `ProjectService.ts` (2,652). These counts identify candidates for a focused maintainability review, not proven defects. Any extraction should preserve existing regression tests.
- `README.rst` still recommends `npm run build`, which is absent from `package.json`; the app script is `npm run build:web`. It also lists authentication as future work although authenticated routes and session management exist in `src/App.tsx`.
- API configuration needs documentation alignment: `.env` defines `VITE_API_URL`, while HTTP modules import the relative `/api` base from `src/config.ts`. Do not assume editing `.env` changes those requests.
- A full bundle/dependency audit remains pending; the observations above are a limited source inspection.

## Resolved since the audit

- Dual Jest/Vitest configuration — `jest.config.js` and Jest deps removed (#143); Vitest only.
- Package identity — `package.json` `name` is now `scipionweb` (c57cf10).
- CI action versions — `tests.yml` now uses `actions/checkout@v7` and `actions/setup-node@v7`.
