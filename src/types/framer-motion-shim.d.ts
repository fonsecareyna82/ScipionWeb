// src/types/framer-motion-shim.d.ts
declare module "framer-motion" {
  import * as React from "react";
  export const AnimatePresence: React.FC<{ children?: React.ReactNode }>;
  export const MotionConfig: React.FC<{ children?: React.ReactNode }>;
  export const motion: any;
  export const m: any;
}
