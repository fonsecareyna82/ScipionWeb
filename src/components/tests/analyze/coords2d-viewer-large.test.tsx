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
  it("draws and reads thumbnails only for the rows on screen", async () => {
    const source = manyMicrographs();
    render(<Coords2dViewer projectId={7} protocolId={40} outputName="outputCoordinates" source={source} />);

    await waitFor(() => expect(shownRows().length).toBeGreaterThan(0));
    await waitFor(() => expect(source.fetchThumbnail).toHaveBeenCalled());

    expect(shownRows().length).toBeLessThan(60);
    // Every thumbnail asked for is of a row on screen; none of the thousands below
    const asked = (source.fetchThumbnail as ReturnType<typeof vi.fn>).mock.calls.map((call) => Number(call[0]));
    expect(Math.max(...asked)).toBeLessThan(60);
  });

  it("draws the rows and reads the thumbnails of where the table is scrolled to", async () => {
    const source = manyMicrographs();
    const { container } = render(
      <Coords2dViewer projectId={7} protocolId={40} outputName="outputCoordinates" source={source} />);
    await waitFor(() => expect(shownRows().length).toBeGreaterThan(0));

    const table = container.querySelector(".MuiTableContainer-root") as HTMLElement;
    table.scrollTop = 48 * 2000;
    fireEvent.scroll(table);

    await waitFor(() => expect(shownRows().some((text) => text.includes("mic_2001.mrc"))).toBe(true));
    await waitFor(() => expect(source.fetchThumbnail).toHaveBeenCalledWith("2001", expect.anything()));
    expect(shownRows().some((text) => text.includes("mic_1.mrc"))).toBe(false);
  });
});
