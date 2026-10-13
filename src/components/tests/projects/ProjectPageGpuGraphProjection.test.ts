import { describe, expect, it } from "vitest";
import { buildGraphElements } from "@/utils/graph_utils";

const protocols: any = {
  PROJECT: { label: "PROJECT", children: ["21", "22"], parents: [] },
  "21": {
    label: "GPU protocol", children: [], parents: ["PROJECT"],
    status: "running", gpuIndicatorEligible: true,
  },
  "22": {
    label: "CPU protocol", children: [], parents: ["PROJECT"],
    status: "running", gpuIndicatorEligible: false,
  },
};

describe("GPU indicator in graph projections", () => {
  it.each(["hierarchical", "grid"] as const)(
    "preserves GPU eligibility in %s nodes",
    (viewMode) => {
      const nodes = buildGraphElements("test-project", protocols, viewMode).nodes;
      expect(nodes.find((node) => node.id === "21")?.data?.gpuIndicatorEligible).toBe(true);
      expect(nodes.find((node) => node.id === "22")?.data?.gpuIndicatorEligible).toBe(false);
    },
  );
});
