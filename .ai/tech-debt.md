# Tech debt — ScipionWeb

Findings from a real audit of this repo (2026-08-04), not a wishlist.

## No `.py` audit performed here

This session's tech-debt audit (TODO/FIXME counts, largest-file scan) used Python-oriented tooling and found effectively nothing in this repo's own code (only `node_modules` matches, which are irrelevant). If a real JS/TS-specific debt audit is wanted later, it needs its own pass (e.g. grepping `.ts`/`.tsx` for TODO/FIXME, checking bundle size, largest components) - not done as part of this round.

## Resolved since the audit

- Dual Jest/Vitest configuration — `jest.config.js` and Jest deps removed (#143); Vitest only.
- Package identity — `package.json` `name` is now `scipionweb` (c57cf10).
- CI action versions — `tests.yml` now uses `actions/checkout@v7` and `actions/setup-node@v7`.
