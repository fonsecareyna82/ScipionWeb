# Tech debt — ScipionWeb

Findings from a real audit of this repo (2026-08-04), not a wishlist.

## Dual test runner configuration

Both `jest.config.js` and `vitest.config.ts` exist, with both toolchains listed in `devDependencies`. Only vitest is actually used (`"test": "vitest --config vitest.config.ts run"` in `package.json`). `jest.config.js` and the jest-related dependencies look vestigial - either genuinely unused (safe to remove after confirming no script/CI path references it) or a leftover from a migration that never finished. Worth resolving one way or the other since it's a real "which one do I use" trap for anyone new to the repo, human or agent.

## Package identity mismatch

`package.json`'s `"name"` field is `"tailadmin-react"` - inherited from the admin-dashboard template this was built on, never renamed. Purely cosmetic (doesn't affect builds or CI), but worth fixing for clarity - anyone grepping npm metadata or publishing this package would see the wrong name.

## No `.py` audit performed here

This session's tech-debt audit (TODO/FIXME counts, largest-file scan) used Python-oriented tooling and found effectively nothing in this repo's own code (only `node_modules` matches, which are irrelevant). If a real JS/TS-specific debt audit is wanted later, it needs its own pass (e.g. grepping `.ts`/`.tsx` for TODO/FIXME, checking bundle size, largest components) - not done as part of this round.

## CI on older action versions

`.github/workflows/tests.yml` uses `actions/checkout@v4` and `actions/setup-node@v4` - the 3 core Python repos were bumped to `@v7`-equivalents this session (clears a Node.js-version deprecation warning GitHub surfaces on older majors). Same fix would apply here, and specifically to `actions/setup-node` given this is exactly the tooling the warning is about.
