import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    volumeViewerSpy: vi.fn(),
    coords3dViewerSpy: vi.fn(),
    tiltSeriesViewerSpy: vi.fn(),
    ctfTomoViewerSpy: vi.fn(),
    metadataViewerSpy: vi.fn(),
    fscViewerSpy: vi.fn(),
}));

vi.mock("@/icons", () => ({
    CloseIcon: (props: Record<string, unknown>) => (
        <svg data-testid="close-icon" {...props} />
    ),
}));

vi.mock("../../analyze/volume-viewer", () => ({
    default: (props: Record<string, unknown>) => {
        mocks.volumeViewerSpy(props);
        return <div>Mock VolumeViewer</div>;
    },
}));

vi.mock("../../analyze/coords3d-viewer", () => ({
    default: (props: Record<string, unknown>) => {
        mocks.coords3dViewerSpy(props);
        return <div>Mock Coords3dViewer</div>;
    },
}));

vi.mock("../../analyze/tiltseries-viewer", () => ({
    default: (props: Record<string, unknown>) => {
        mocks.tiltSeriesViewerSpy(props);
        return <div>Mock TiltSeriesViewer</div>;
    },
}));

vi.mock("../../analyze/ctftomo-viewer", () => ({
    default: (props: Record<string, unknown>) => {
        mocks.ctfTomoViewerSpy(props);
        return <div>Mock CTFTomoViewer</div>;
    },
}));

vi.mock("../../analyze/metadata-viewer", () => ({
    MetadataViewer: (props: Record<string, unknown>) => {
        mocks.metadataViewerSpy(props);
        return <div>Mock MetadataViewer</div>;
    },
}));

vi.mock("../../analyze/fsc-viewer", () => ({
    default: (props: Record<string, unknown>) => {
        mocks.fscViewerSpy(props);
        return <div>Mock FscViewer</div>;
    },
}));

import AnalyzeOutputDialog from "../../analyze/analyze-output-dialog";

type AnalyzeOutputDialogProps = ComponentProps<typeof AnalyzeOutputDialog>;

function makeProps(
    overrides: Partial<AnalyzeOutputDialogProps> = {},
): AnalyzeOutputDialogProps {
    return {
        open: true,
        onClose: vi.fn(),
        projectId: "12",
        protocolId: "34",
        protocolLabel: "Prot A",
        outputName: "outputA",
        outputRaw: {
            _class: "SetOfParticles",
            paramClass: "PointerParam",
            value: "out.sqlite",
            info: "output info",
        },
        ...overrides,
    };
}

describe("AnalyzeOutputDialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not render the dialog title when closed", () => {
        render(<AnalyzeOutputDialog {...makeProps({ open: false })} />);

        expect(
            screen.queryByText(/Analyze Result/i),
        ).not.toBeInTheDocument();
    });

    it("renders the volume viewer for volume outputs", () => {
        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    outputRaw: {
                        _class: "Volume",
                        paramClass: "PointerParam",
                        value: "vol.mrc",
                    },
                })}
            />,
        );

        expect(screen.getByText("Mock VolumeViewer")).toBeInTheDocument();
        expect(mocks.volumeViewerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 12,
                protocolId: 34,
                protocolLabel: "Prot A",
                outputName: "outputA",
                pointerClass: "Volume",
            }),
        );
    });

    it("renders the coords3d viewer for SetOfCoordinates3D outputs", () => {
        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    outputRaw: {
                        _class: "SetOfCoordinates3D",
                    },
                })}
            />,
        );

        expect(screen.getByText("Mock Coords3dViewer")).toBeInTheDocument();
        expect(mocks.coords3dViewerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 12,
                protocolId: 34,
                protocolLabel: "Prot A",
                outputName: "outputA",
            }),
        );
    });

    it("renders the tilt series viewer for SetOfTiltSeries outputs", () => {
        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    outputRaw: {
                        _class: "SetOfTiltSeries",
                    },
                })}
            />,
        );

        expect(screen.getByText("Mock TiltSeriesViewer")).toBeInTheDocument();
        expect(mocks.tiltSeriesViewerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 12,
                protocolId: 34,
                outputName: "outputA",
            }),
        );
    });

    it("renders the CTF tomo viewer for SetOfCTFTomoSeries outputs", () => {
        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    outputRaw: {
                        _class: "SetOfCTFTomoSeries",
                    },
                })}
            />,
        );

        expect(screen.getByText("Mock CTFTomoViewer")).toBeInTheDocument();
        expect(mocks.ctfTomoViewerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 12,
                protocolId: 34,
                outputName: "outputA",
            }),
        );
    });

    it("renders the metadata viewer for metadata-like outputs", () => {
        const onClose = vi.fn();

        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    onClose,
                    outputRaw: {
                        _class: "SetOfParticles",
                    },
                })}
            />,
        );

        expect(screen.getByText("Mock MetadataViewer")).toBeInTheDocument();
        expect(mocks.metadataViewerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 12,
                protocolId: 34,
                outputName: "outputA",
                onClose,
            }),
        );
    });

    it("renders the FSC viewer for SetOfFSCs outputs", () => {
        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    outputRaw: {
                        _class: "SetOfFSCs",
                    },
                })}
            />,
        );

        expect(screen.getByText("Mock FscViewer")).toBeInTheDocument();
        expect(mocks.fscViewerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 12,
                protocolId: 34,
                outputName: "outputA",
            }),
        );
    });

    it("unwraps legacy single-key objects before resolving the viewer", () => {
        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    outputRaw: {
                        outputA: {
                            _class: "VolumeMask",
                            paramClass: "PointerParam",
                            value: "mask.mrc",
                        },
                    },
                })}
            />,
        );

        expect(screen.getByText("Mock VolumeViewer")).toBeInTheDocument();
        expect(mocks.volumeViewerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                pointerClass: "VolumeMask",
            }),
        );
    });

    it("shows the fallback message for unsupported output types", () => {
        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    outputRaw: {
                        _class: "CustomUnsupportedThing",
                        paramClass: "CustomParam",
                    },
                })}
            />,
        );

        expect(
            screen.getByText("No specialized viewer yet for this output type."),
        ).toBeInTheDocument();
        expect(screen.getByText("outputA")).toBeInTheDocument();
        expect(screen.getAllByText("CustomUnsupportedThing").length).toBeGreaterThan(0);
        expect(screen.getByText("CustomParam")).toBeInTheDocument();
    });

    it("calls onClose when the close button is clicked", () => {
        const onClose = vi.fn();

        render(<AnalyzeOutputDialog {...makeProps({ onClose })} />);

        fireEvent.click(
            screen.getByRole("button", { name: "Close analyze dialog" }),
        );

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});