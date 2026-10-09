import { describe, expect, it } from "vitest";
import { buildGraphElements } from "@/utils/graph_utils";

const protocols: any = {
  PROJECT: { label: "PROJECT", children: ["25"], parents: [] },
  "25": {
    protocolId: "25", label: "ProtUnionSet", children: [], parents: [],
    status: "running", elapsedTime: "6", elapsedSessionId: "run-120",
  },
};

describe("#120 graph session projections", () => {
  it("keeps elapsed session ID in the table", () => {
    const table = buildGraphElements("test-project", protocols, "table").table;
    expect(table?.find((row: any) => row.id === "25")?.elapsedSessionId).toBe("run-120");
  });

  it("keeps elapsed session ID in grid", () => {
    const nodes = buildGraphElements("test-project", protocols, "grid").nodes;
    expect(nodes?.find((node) => node.id === "25")?.data?.elapsedSessionId).toBe("run-120");
  });

  it("keeps elapsed session ID in hierarchical graph", () => {
    const nodes = buildGraphElements("test-project", protocols, "hierarchical").nodes;
    expect(nodes?.find((node) => node.id === "25")?.data?.elapsedSessionId).toBe("run-120");
  });
});
