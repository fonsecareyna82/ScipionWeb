import type { ThreeElements } from "@react-three/fiber";

declare global {
  namespace JSX {
    // This makes <mesh/>, <boxGeometry/>, <ambientLight/> etc. valid everywhere.
    interface IntrinsicElements extends ThreeElements {}
  }
}

export {};
