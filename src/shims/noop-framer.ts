// src/shims/noop-framer.ts
// No-op shim for framer-motion used only in UMD builds.
// Prevents crashes from motion internals calling `.add` on undefined structures.

import React from "react";

// Render children directly; no animations (no JSX here to keep .ts extension happy)
export const AnimatePresence: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  React.createElement(React.Fragment, null, children);

// Return plain elements; motion.div(...) => <div {...props}/>
export const motion: any = new Proxy({}, {
  get: (_target, tag: string) => {
    return (props: any) => React.createElement(tag as any, props, props?.children);
  },
});

// Common named exports some code paths may import
export const m = motion;

export const MotionConfig: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  React.createElement(React.Fragment, null, children);

console.log("[noop-framer] shim loaded");