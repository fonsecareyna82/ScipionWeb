import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Coords2dViewer, { type Coords2dDataSource } from "@/components/analyze/coords2d-viewer";

vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => ({}) }));

// jsdom has no ResizeObserver; the viewer only uses it to follow its size.
class NoResizeObserver {
  observe() { return undefined; }
  unobserve() { return undefined; }
  disconnect() { return undefined; }
}
vi.stubGlobal("ResizeObserver", NoResizeObserver);

const MICROGRAPHS = 3000;

function fakeImage() {
  return Promise.resolve({ url: "blob:micrograph", revoke: () => undefined, originalWidth: 400, originalHeight: 300 });
}

function manyMicrographs(): Coords2dDataSource {
  return {
    key: "coordinates:7:40",
    listMicrographs: vi.fn().mockResolvedValue({
      micrographs: Array.from({ length: MICROGRAPHS }, (_, index) => ({
        id: String(index + 1), index: index + 1, fileName: `mic_${index + 1}.mrc`, label: `mic_${index + 1}.mrc`,
        particles: 100,
      })),
      totalMicrographs: MICROGRAPHS, totalPicks: MICROGRAPHS * 100, boxSize: 99,
    }),
    fetchCoordinates: vi.fn().mockResolvedValue([{ id: "p1", micId: "1", x: 100, y: 120 }]),
    fetchImage: vi.fn().mockImplementation(fakeImage),
    fetchThumbnail: vi.fn().mockImplementation(fakeImage),
    createOutput: vi.fn(),
  };
}

function shownRows(): string[] {
  return screen.getAllByRole("row").map((row) => row.textContent ?? "").filter((text) => text.includes("mic_"));
}

describe("The coordinates viewer with thousands of micrographs", () => {
  it("draws only the rows on screen and reads no thumbnails for the table", async () => {
    const source = manyMicrographs();
    render(<Coords2dViewer projectId={7} protocolId={40} protocolLabel="picking" outputName="outputCoordinates"
                           source={source} />);

    await waitFor(() => expect(shownRows().length).toBeGreaterThan(0));
    await waitFor(() => expect(source.fetchImage).toHaveBeenCalled());

    expect(shownRows().length).toBeLessThan(60);
    // Only the placeholder of the micrograph opened: no thumbnail per row competing with its image
    const asked = (source.fetchThumbnail as ReturnType<typeof vi.fn>).mock.calls.map((call) => String(call[0]));
    expect(asked.every((micId) => micId === "1")).toBe(true);
    expect(screen.queryByRole("columnheader", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("draws the rows of where the table is scrolled to", async () => {
    const source = manyMicrographs();
    const { container } = render(
      <Coords2dViewer projectId={7} protocolId={40} protocolLabel="picking" outputName="outputCoordinates"
                      source={source} />);
    await waitFor(() => expect(shownRows().length).toBeGreaterThan(0));

    const table = container.querySelector(".MuiTableContainer-root") as HTMLElement;
    table.scrollTop = 36 * 2000;
    fireEvent.scroll(table);

    // Generous: with the whole suite running, drawing a table of 3000 rows takes its time
    await waitFor(() => expect(shownRows().some((text) => text.includes("mic_2001.mrc"))).toBe(true),
      { timeout: 5000 });
    expect(shownRows().some((text) => text.includes("mic_1.mrc"))).toBe(false);
  });
});
