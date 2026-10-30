import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({ fetchProtocolSummary: vi.fn() }));
vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => serviceMocks }));
const opened = vi.hoisted(() => vi.fn());
vi.mock("@/components/analyze/analyze-output-dialog", () => ({
  default: (props: any) => {
    opened(props);
    return <div role="dialog">{props.displayName}</div>;
  },
}));

import ProtocolSummaryPanel, {
  buildSummaryBlocks, parseSummaryLine, SUMMARY_POLL_MS,
} from "@/components/protocol/ProtocolSummaryPanel";

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

describe("buildSummaryBlocks", () => {
  it("makes facts of the label: value lines and sections of the comments, error and warnings", () => {
    expect(buildSummaryBlocks([
      "Imported tilt-series movies from: /data/chlamy/\nUsing pattern: */frames/*.mdoc",
      "patch_size = *32*",
      "Tomogram denoising finished.",
      "", "*COMMENTS:* ", "Second try",
      "", "*ERROR:*", "Out of memory",
    ])).toEqual([
      { kind: "main", rows: [
        { kind: "fact", label: "Imported tilt-series movies from", value: "/data/chlamy/" },
        { kind: "fact", label: "Using pattern", value: "*/frames/*.mdoc" },
        { kind: "fact", label: "patch_size", value: "*32*" },
        { kind: "line", text: "Tomogram denoising finished." },
      ] },
      { kind: "comments", rows: [{ kind: "line", text: "Second try" }] },
      { kind: "error", rows: [{ kind: "line", text: "Out of memory" }] },
    ]);
  });

  it("leaves a link alone: its colon is no label", () => {
    expect(buildSummaryBlocks(["See https://scipion.i2pc.es"])[0].rows).toEqual([
      { kind: "line", text: "See https://scipion.i2pc.es" }]);
  });
});

describe("ProtocolSummaryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the facts, the error in its own box, and opens the objects its lines link to", async () => {
    serviceMocks.fetchProtocolSummary.mockResolvedValue({
      lines: ["Micrographs: *12*\nfrom [[sci-open:41][outputMicrographs]]", "", "*ERROR:*", "Out of memory"],
      objects: { "41": { protocolId: 2, outputName: "outputMicrographs", className: "SetOfMicrographs",
                         label: "Micrographs of grid 3" } },
      hasWarnings: false,
    });

    render(<ProtocolSummaryPanel projectId={7} protocolId="5" protocolLabel="CTF" protocolStatus="failed" />);

    expect(await screen.findByText("Micrographs")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Error" })).getByText("Out of memory")).toBeInTheDocument();
    expect(serviceMocks.fetchProtocolSummary).toHaveBeenCalledWith(7, "5");
    // A failed protocol does not change: it is not read again
    expect(screen.queryByText("Live")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "outputMicrographs" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Micrographs of grid 3");
    expect(opened).toHaveBeenLastCalledWith(expect.objectContaining({
      projectId: 7, protocolId: 2, outputName: "outputMicrographs", protocolLabel: "#2",
      outputRaw: { pointerClass: "SetOfMicrographs" },
    }));
  });

  it("reads a live protocol's summary every few seconds, and stops once it finishes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serviceMocks.fetchProtocolSummary
      .mockResolvedValueOnce({ lines: ["Output not ready yet."], objects: {}, hasWarnings: false })
      .mockResolvedValue({ lines: ["Movies imported: *40*"], objects: {}, hasWarnings: false });

    const { rerender } = render(<ProtocolSummaryPanel projectId={7} protocolId="2" protocolStatus="running" />);
    expect(await screen.findByText("Output not ready yet.")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUMMARY_POLL_MS);
    });
    expect(await screen.findByText("40")).toBeInTheDocument();
    expect(serviceMocks.fetchProtocolSummary).toHaveBeenCalledTimes(2);

    rerender(<ProtocolSummaryPanel projectId={7} protocolId="2" protocolStatus="finished" />);
    await waitFor(() => expect(serviceMocks.fetchProtocolSummary).toHaveBeenCalledTimes(3));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUMMARY_POLL_MS * 3);
    });
    expect(serviceMocks.fetchProtocolSummary).toHaveBeenCalledTimes(3);
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it("does not read while the page is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serviceMocks.fetchProtocolSummary.mockResolvedValue({ lines: ["Running"], objects: {}, hasWarnings: false });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<ProtocolSummaryPanel projectId={7} protocolId="2" protocolStatus="running" />);
    expect(await screen.findByText("Running")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUMMARY_POLL_MS * 2);
    });
    expect(serviceMocks.fetchProtocolSummary).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it("says when a protocol gives no summary, and why one could not be read", async () => {
    serviceMocks.fetchProtocolSummary.mockResolvedValueOnce({ lines: ["No summary information."], objects: {},
                                                               hasWarnings: false });
    const { unmount } = render(<ProtocolSummaryPanel projectId={7} protocolId="2" />);
    expect(await screen.findByText("This protocol gives no summary.")).toBeInTheDocument();
    unmount();

    serviceMocks.fetchProtocolSummary.mockRejectedValue(new Error("The summary of the protocol could not be read"));
    render(<ProtocolSummaryPanel projectId={7} protocolId="3" />);
    expect(await screen.findByText("The summary of the protocol could not be read")).toBeInTheDocument();
  });
});
