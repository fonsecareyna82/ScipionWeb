import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

if (typeof window !== "undefined") {
  if (!window.URL.createObjectURL) {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:mock-object-url"),
    });
  }

  if (!window.URL.revokeObjectURL) {
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  }
}
