/// <reference types="vite/client" />
/// <reference types="@react-three/fiber" />

import type { ThreeElements } from "@react-three/fiber";

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

export {};
