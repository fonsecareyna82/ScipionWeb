import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageCard, StreamFlowStatus } from "@/components/monitor/monitor-parts";
import type { StreamingMonitorFlow, StreamingMonitorStage } from "@/services/ProjectService";

const FLOW: StreamingMonitorFlow = {
  acquisition: "active", unit: "movies", activityUnit: "movies", items: 1234, protocolId: "2", label: "import movies",
  lastItemAt: "2026-10-28T11:48:00Z", finishedAt: null, stalled: [], complete: false,
};

function shown(flow: Partial<StreamingMonitorFlow>) {
  return render(<StreamFlowStatus flow={{ ...FLOW, ...flow }} />).container;
}

describe("StreamFlowStatus", () => {
  it("says nothing while the movies come", () => {
    expect(shown({}).textContent).toBe("");
  });

  it("tells a pause, and how long the import still waits for movies", () => {
    shown({ acquisition: "paused", idleMinutes: 12.4, importClosesInMinutes: 17.6 });
    expect(screen.getByText(/No new movies for 12 min/)).toHaveTextContent("the import closes on its own in 18 min");
  });

  it("tells a finished acquisition apart from a stopped microscope, and a complete session", () => {
    shown({ acquisition: "finished", finishedAt: "2026-10-28T11:50:00Z" });
    expect(screen.getByText(/Acquisition finished at .* with 1\D?234 movies/)).toBeInTheDocument();
    expect(screen.queryByText(/No new movies/)).not.toBeInTheDocument();

    shown({ acquisition: "finished", finishedAt: "2026-10-28T11:50:00Z", complete: true });
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  it("tells an import that stopped without closing its movies", () => {
    shown({ acquisition: "stopped", protocolStatus: "failed" });
    expect(screen.getByText(/The import \(import movies\) is failed/)).toBeInTheDocument();
  });

  it("tells each stage that gives nothing while items wait, also after the acquisition", () => {
    shown({ acquisition: "finished", stalled: [
      { stage: "ctf", protocolId: "3", label: "ctffind", behind: 40, minutes: 75, protocolStatus: "failed" }] });
    expect(screen.getByText(/CTF \(ctffind\): no progress for 1 h 15 min, with 40 waiting/))
      .toHaveTextContent("The run is failed.");
  });
});

describe("StageCard", () => {
  it("marks a stage that gives nothing for longer than its threshold", () => {
    const stage = { stage: "ctf", setId: 30, protocolId: "3", protocolClassName: "ProtCTFFind", label: "ctffind",
                    status: "running", outputName: "outputCTF", setClassName: "SetOfCTF", items: 90, maxItemId: 90,
                    streaming: true, perMinute: 0, trend: "steady", behind: 40, stalled: true,
                    stalledMinutes: 20 } as StreamingMonitorStage;
    render(<StageCard stage={stage} />);

    expect(screen.getByTestId("stage-stalled")).toHaveTextContent("No progress for 20 min");
    // Not told twice
    expect(screen.queryByText(/· stalled/)).not.toBeInTheDocument();
  });
});
