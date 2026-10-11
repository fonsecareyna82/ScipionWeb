# Roadmap — ScipionWeb

**Status: draft, pending review with Yunior (repo co-owner).** Seeded from a rough team Google Doc plus findings surfaced while documenting this repo (2026-08-04). Treat as a starting point, not a committed plan.

## This repo specifically

- A real JS/TS-focused tech-debt audit (TODO/FIXME markers, largest components, bundle size) hasn't been done yet - this session's audit only covered the 3 core Python repos and ScipionAPI in depth.

## Completed maintenance (verified 2026-10-11)

- Removed the Jest configuration and dependencies; `npm test` uses Vitest.
- Renamed the package to `scipionweb` (currently version `4.0.0`).
- Updated test CI to `actions/checkout@v7` and `actions/setup-node@v7`.

## Ecosystem-wide (applies to all 5 repos, not just this one)

- **Branch/release cleanup**: drop the redundant `master` branch (if this repo has one - confirm), rename `devel` → `main`, replace push-triggered publish with a manual `workflow_dispatch` release gated by a protected GitHub deployment environment. `I2PC/scipion-em-xmipp`'s `.github/workflows/release.yml` is a concrete reference for the Python repos - this one would need a JS/TS-appropriate equivalent (npm publish or a deployment step, not a Python build).
- **This repo, alongside ScipionAPI, is the replacement for the legacy Tkinter GUI** (and an intermediate NiceGUI attempt that didn't ship) - once feature-complete, Tkinter code across the other repos can start being removed.
- **Convert buildbot to a GitHub Actions self-hosted runner.**
- **Set up a dependency manager (Renovate)** across all 5 repos - relevant here too given the size of `package.json`'s dependency list.
