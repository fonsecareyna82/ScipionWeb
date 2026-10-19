import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CompareRunsDialog, { orderCompareCandidates, type CompareRunCandidate } from "@/components/protocol/CompareRunsDialog";

const runs: CompareRunCandidate[] = [
  { id: "4", label: "ctf consensus", title: "xmipp3 - ctf consensus", status: "finished", outputCount: 2 },
  { id: "9", label: "ctf consensus strict", title: "xmipp3 - ctf consensus", status: "finished", outputCount: 2 },
  { id: "12", label: "ctf consensus 2", title: "xmipp3 - ctf consensus", status: "failed", outputCount: 0 },
  { id: "15", label: "extract", title: "xmipp3 - extract particles", status: "finished", outputCount: 1 },
];

// The shape the protocol details route returns: the form's sections and the values.
function details(resolution: string, astigmatism: string) {
  return {
    form: { sections: [{ label: "Criteria", params: [
      { name: "resolution", label: "Max resolution (Å)", paramClass: "FloatParam" },
      { name: "astigmatism", label: "Astigmatism", paramClass: "FloatParam" },
    ] }] },
    values: { resolution, astigmatism, _runtime: { ignored: true } },
  };
}

describe("CompareRunsDialog", () => {
  it("offers runs of the same class first, newest first", () => {
    expect(orderCompareCandidates(runs[0], runs).map((run) => run.id)).toEqual(["12", "9", "15"]);
  });

  it("compares with the given run and shows the parameters that differ, by their labels", async () => {
    const fetchProtocolDetails = vi.fn((_project: string, id: string) =>
      Promise.resolve(id === "4" ? details("5", "1000") : details("8", "1000")));
    render(
      <CompareRunsDialog open projectName="Workflow_2D" baseId="4" otherId="9" candidates={runs}
        fetchProtocolDetails={fetchProtocolDetails} onClose={() => undefined} />,
    );
    expect((screen.getByLabelText("Run to compare with") as HTMLSelectElement).value).toBe("9");
    await screen.findAllByText("Max resolution (Å)");
    expect(fetchProtocolDetails).toHaveBeenCalledWith("Workflow_2D", "4");
    expect(fetchProtocolDetails).toHaveBeenCalledWith("Workflow_2D", "9");
    expect(screen.queryByText("_runtime")).toBeNull();

    fireEvent.change(screen.getByLabelText("Run to compare with"), { target: { value: "12" } });
    await waitFor(() => expect(fetchProtocolDetails).toHaveBeenCalledWith("Workflow_2D", "12"));
  });

  it("closes with Escape", () => {
    const onClose = vi.fn();
    render(
      <CompareRunsDialog open projectName="P" baseId="15" candidates={runs}
        fetchProtocolDetails={() => new Promise(() => undefined)} onClose={onClose} />,
    );
    // Without a run of its class, the newest other run is offered.
    expect((screen.getByLabelText("Run to compare with") as HTMLSelectElement).value).toBe("12");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
