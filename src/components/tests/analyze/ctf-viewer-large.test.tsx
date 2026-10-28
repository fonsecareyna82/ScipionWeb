import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
    listOutputCTFs: vi.fn(),
    fetchCTFPsdImageObjectUrl: vi.fn(),
    fetchCTFMicrographImageObjectUrl: vi.fn(),
}));

vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => serviceMocks }));
// The plot of a CTF picked in it selects that row, as a click on its point would
vi.mock("react-plotly.js", () => ({
    default: ({ onClick }: { onClick?: (event: unknown) => void }) => (
        <button type="button" onClick={() => onClick?.({ points: [{ customdata: ["30000", "mic_30000.mrc"] }], event: { button: 0 } })}>
            pick-ctf-30000
        </button>
    ),
}));
vi.mock("../../analyze/metadata-viewer", () => ({ MetadataViewer: () => null }));

// jsdom has no ResizeObserver; the table only uses it to follow its size.
class NoResizeObserver {
    observe() { return undefined; }
    unobserve() { return undefined; }
    disconnect() { return undefined; }
}
vi.stubGlobal("ResizeObserver", NoResizeObserver);

import CtfViewer from "../../analyze/ctf-viewer";

const CTFS = 37000;

function manyCtfs() {
    serviceMocks.listOutputCTFs.mockResolvedValue({
        total: CTFS,
        ctfs: Array.from({ length: CTFS }, (_, index) => ({
            ctfId: String(index + 1), position: index, micrographId: String(index + 1),
            micrographName: `mic_${index + 1}.mrc`, excluded: false, failed: false, defocusU: 20000 + index,
            defocusV: 19500 + index, astigmatism: 500, defocusAngle: 30, resolution: 4, fitQuality: 0.2,
            psdFile: `Runs/psd_${index + 1}.mrc`,
        })),
    });
    const image = async (_p: unknown, _q: unknown, _o: unknown, ctfId: string) => ({ url: `blob:${ctfId}`, revoke: vi.fn() });
    serviceMocks.fetchCTFMicrographImageObjectUrl.mockImplementation(image);
    serviceMocks.fetchCTFPsdImageObjectUrl.mockImplementation(image);
}

const shownRows = () => screen.getAllByRole("row").map((row) => row.textContent ?? "").filter((text) => text.includes("mic_"));

describe("The CTF viewer with tens of thousands of micrographs", () => {
    it("draws only the rows on screen, and those of where the table is scrolled to", async () => {
        manyCtfs();
        const { container } = render(<CtfViewer projectId={1} protocolId={2} outputName="outputCTF" />);

        await waitFor(() => expect(shownRows().length).toBeGreaterThan(0));
        expect(shownRows().length).toBeLessThan(80);

        const table = container.querySelector("table")!.parentElement as HTMLElement;
        table.scrollTop = 34 * 20000;
        fireEvent.scroll(table);

        await waitFor(() => expect(shownRows().some((text) => text.includes("mic_20001.mrc"))).toBe(true),
            { timeout: 5000 });
        expect(shownRows().some((text) => text.startsWith("mic_1.mrc"))).toBe(false);
    });

    it("brings a CTF picked in the plot into the table, though its row was not drawn", async () => {
        manyCtfs();
        const { container } = render(<CtfViewer projectId={1} protocolId={2} outputName="outputCTF" />);
        await waitFor(() => expect(shownRows().length).toBeGreaterThan(0));
        const table = container.querySelector("table")!.parentElement as HTMLElement;
        Object.defineProperty(table, "clientHeight", { configurable: true, value: 600 });

        fireEvent.click(screen.getByRole("button", { name: "pick-ctf-30000" }));

        await waitFor(() => expect(table.scrollTop).toBeGreaterThan(34 * 29000), { timeout: 5000 });
    });

    it("asks for the images of the next row while this one is looked at", async () => {
        manyCtfs();
        render(<CtfViewer projectId={1} protocolId={2} outputName="outputCTF" />);

        await waitFor(() => expect(serviceMocks.fetchCTFMicrographImageObjectUrl).toHaveBeenCalledWith(
            1, 2, "outputCTF", "2", expect.anything()), { timeout: 5000 });
        expect(serviceMocks.fetchCTFPsdImageObjectUrl).toHaveBeenCalledWith(1, 2, "outputCTF", "2", expect.anything());
    });
});
