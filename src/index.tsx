// src/index.tsx

// -----------------------------
// Public Types
// -----------------------------
export type { ProjectService, ProjectPayload } from "./services/ProjectService";

// -----------------------------
// Projects List Widget (UMD entry: entry-umd.tsx)
// -----------------------------
export { mount as mountProjectsWidget } from "./entry-umd";
export type { MountOptions as ProjectsMountOptions } from "./entry-umd";

// -----------------------------
// Project Page Widget (UMD entry: entry-projectpage-umd.tsx)
// -----------------------------
export { mountProjectPageWidget } from "./entry-projectpage-umd";
export type { ProjectPageMountOptions } from "./entry-projectpage-umd";

// -----------------------------
// Optional Default Export (ESM/CJS convenience)
// -----------------------------
const api = {
  mountProjectsWidget: undefined as unknown as typeof import("./entry-umd").mount,
  mountProjectPageWidget: undefined as unknown as typeof import("./entry-projectpage-umd").mountProjectPageWidget,
};

export default api;

/*
  Why this file:
  - Acts as a stable, tree-shakeable public API for module consumers.
  - Keeps UMD global exposure inside the entry-*.tsx files only.
  - Makes it easy to consume either widget from ESM/CJS without touching window.
*/
