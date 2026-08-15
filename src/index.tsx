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
export type {
  ProjectPageMountOptions,
  // export InitialProps too if you exposed it in entry-projectpage-umd.tsx
  // InitialProps as ProjectPageInitialProps,
} from "./entry-projectpage-umd";

// -----------------------------
// Protocol Detail Widget (UMD entry: entry-protocoldetail-umd.tsx)
// -----------------------------
export { mountProtocolDetailWidget } from "./entry-protocoldetail-umd";
export type {
  ProtocolDetailMountOptions,
  ProtocolDetailInitialProps,
} from "./entry-protocoldetail-umd";

// -----------------------------
// Optional Default Export (ESM/CJS convenience)
// -----------------------------
const api = {
  mountProjectsWidget: undefined as unknown as typeof import("./entry-umd").mount,
  mountProjectPageWidget: undefined as unknown as typeof import("./entry-projectpage-umd").mountProjectPageWidget,
  mountProtocolDetailWidget: undefined as unknown as typeof import("./entry-protocoldetail-umd").mountProtocolDetailWidget,
};

export default api;

/*
  Why this file:
  - Acts as a stable, tree-shakeable public API for module consumers.
  - Keeps UMD global exposure inside the individual entry-*.tsx files only.
  - Makes it easy to consume widgets from ESM/CJS without touching window.
*/
