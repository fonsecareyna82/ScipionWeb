import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({ fetchProtocolSummary: vi.fn() }));
vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => serviceMocks }));
const opened = vi.hoisted(() => vi.fn());
vi.mock("@/components/analyze/analyze-output-dialog", () => ({
  default: (props: any) => {
    opened(props);
    return <div role="dialog">{props.displayName}</div>;
  },
}));

import ProtocolSummaryPanel, { parseSummaryLine } from "@/components/protocol/ProtocolSummaryPanel";

describe("parseSummaryLine", () => {
  it("reads Scipion's markup as the desktop does", () => {
    expect(parseSummaryLine("*12* movies imported from _grid 3_")).toEqual([
      { kind: "bold", text: "12" },
      { kind: "text", text: " movies imported from" },
      { kind: "text", text: " " },
      { kind: "italic", text: "grid 3" },
    ]);
    expect(parseSummaryLine("Input [[sci-open:41][outputMicrographs]] see https://scipion.i2pc.es")).toEqual([
      { kind: "text", text: "Input " },
      { kind: "object", text: "outputMicrographs", objectId: "41" },
      { kind: "text", text: " see " },
      { kind: "url", text: "https://scipion.i2pc.es", href: "https://scipion.i2pc.es" },
    ]);
    expect(parseSummaryLine("Log at [[Runs/000002/logs/run.log][run.log]], '''x = 1'''")).toEqual([
      { kind: "text", text: "Log at " },
      { kind: "path", text: "run.log", path: "Runs/000002/logs/run.log" },
      { kind: "text", text: ", " },
      { kind: "fixed", text: "x = 1" },
    ]);
    // An asterisk that does not close a word is no markup
    expect(parseSummaryLine("2 * 3")).toEqual([{ kind: "text", text: "2 * 3" }]);
  });
});

describe("ProtocolSummaryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the summary with its error and opens the objects its lines link to", async () => {
    serviceMocks.fetchProtocolSummary.mockResolvedValue({
      lines: ["*12* micrographs\nfrom [[sci-open:41][outputMicrographs]]", "", "*ERROR:*", "Out of memory"],
      objects: { "41": { protocolId: 2, outputName: "outputMicrographs", className: "SetOfMicrographs",
                         label: "Micrographs of grid 3" } },
      hasWarnings: true,
    });

    render(<ProtocolSummaryPanel projectId={7} protocolId="5" protocolLabel="CTF" protocolStatus="failed" />);

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("Out of memory")).toHaveClass("text-red-700");
    expect(screen.getByText("Warnings")).toBeInTheDocument();
    expect(serviceMocks.fetchProtocolSummary).toHaveBeenCalledWith(7, "5");

    fireEvent.click(screen.getByRole("button", { name: "outputMicrographs" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Micrographs of grid 3");
    expect(opened).toHaveBeenLastCalledWith(expect.objectContaining({
      projectId: 7, protocolId: 2, outputName: "outputMicrographs", protocolLabel: "#2",
      outputRaw: { pointerClass: "SetOfMicrographs" },
    }));
  });

  it("reads the summary again when the protocol's status changes", async () => {
    serviceMocks.fetchProtocolSummary
      .mockResolvedValueOnce({ lines: ["Output not ready yet."], objects: {}, hasWarnings: false })
      .mockResolvedValueOnce({ lines: ["*40* movies imported"], objects: {}, hasWarnings: false });

    const { rerender } = render(<ProtocolSummaryPanel projectId={7} protocolId="2" protocolStatus="running" />);
    expect(await screen.findByText("Output not ready yet.")).toBeInTheDocument();

    rerender(<ProtocolSummaryPanel projectId={7} protocolId="2" protocolStatus="finished" />);

    expect(await screen.findByText("40")).toBeInTheDocument();
    expect(serviceMocks.fetchProtocolSummary).toHaveBeenCalledTimes(2);
  });

  it("tells why the summary could not be read", async () => {
    serviceMocks.fetchProtocolSummary.mockRejectedValue(new Error("The summary of the protocol could not be read"));
    render(<ProtocolSummaryPanel projectId={7} protocolId="2" />);

    expect(await screen.findByText("The summary of the protocol could not be read")).toBeInTheDocument();

    serviceMocks.fetchProtocolSummary.mockResolvedValue({ lines: ["Done"], objects: {}, hasWarnings: false });
    fireEvent.click(screen.getByRole("button", { name: "Reload summary" }));
    await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
  });
});
