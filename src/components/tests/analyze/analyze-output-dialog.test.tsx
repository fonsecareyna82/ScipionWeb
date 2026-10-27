import type { ComponentProps } from "react";
import {
    fireEvent,
    render,
    screen,
    within,
    waitFor,
    act,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    volumeViewerSpy: vi.fn(),
    coords3dViewerSpy: vi.fn(),
    tiltSeriesViewerSpy: vi.fn(),
    ctfTomoViewerSpy: vi.fn(),
    metadataViewerSpy: vi.fn(),
    fscViewerSpy: vi.fn(),
    fetchProtocolDetails: vi.fn().mockResolvedValue({ id: "34", status: "finished" }),
    ctfViewerSpy: vi.fn(),
    fetchIntegratedAnalyzeContext: vi.fn().mockResolvedValue({
        root: {},
        links: {},
        summaries: {},
        relations: { items: [] },
    }),
}));

vi.mock("@/icons", () => ({
    CloseIcon: (props: Record<string, unknown>) => (
        <svg data-testid="close-icon" {...props} />
    ),
}));

vi.mock("@/ProjectServiceContext", () => {
    const service = {
        fetchIntegratedAnalyzeContext: mocks.fetchIntegratedAnalyzeContext,
        fetchProtocolDetails: mocks.fetchProtocolDetails,
    };
    return { useProjectService: () => service };
});

vi.mock("@/context/ThemeContext", () => ({
    useTheme: () => ({
        theme: "light",
        toggleTheme: vi.fn(),
        setThemeMode: vi.fn(),
    }),
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

vi.mock("../../analyze/ctf-viewer", () => ({
    default: (props: Record<string, unknown>) => {
        mocks.ctfViewerSpy(props);
        return <div>Mock CtfViewer</div>;
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
        protocolStatus: "finished",
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
        mocks.fetchProtocolDetails.mockReset().mockResolvedValue({ id: "34", status: "finished" });
    });

    it("uses a circular status badge and updates its hue when the supplied status changes", () => {
        const view = render(<AnalyzeOutputDialog {...makeProps({ protocolStatus: "running" })} />);
        const badge = screen.getByLabelText("Protocol ID 34");
        expect(badge).toHaveClass("rounded-full");
        expect(badge.style.width).toBe(badge.style.height);
        expect(badge.style.backgroundColor).toBe("var(--app-amber-100)");
        view.rerender(<AnalyzeOutputDialog {...makeProps({ protocolStatus: "finished" })} />);
        expect(badge.style.backgroundColor).toBe("var(--app-green-100)");
        expect(mocks.fetchProtocolDetails).not.toHaveBeenCalled();
    });

    it("reads a missing status and rejects a detail response from another protocol", async () => {
        mocks.fetchProtocolDetails.mockResolvedValueOnce({ id: "99", status: "failed" });
        render(<AnalyzeOutputDialog {...makeProps({ protocolStatus: undefined })} />);
        await waitFor(() => expect(mocks.fetchProtocolDetails).toHaveBeenCalledWith("12", "34"));
        expect(screen.getByLabelText("Protocol ID 34")).toHaveAttribute("data-protocol-status", "unknown");
    });

    it("uses the matching fetched status and ignores a late response after switching protocols", async () => {
        let finishOld!: (value: { id: string; status: string }) => void;
        mocks.fetchProtocolDetails.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
            .mockResolvedValueOnce({ id: "35", status: "failed" });
        const view = render(<AnalyzeOutputDialog {...makeProps({ protocolStatus: undefined })} />);
        view.rerender(<AnalyzeOutputDialog {...makeProps({ protocolId: "35", protocolStatus: undefined })} />);
        await waitFor(() => expect(screen.getByLabelText("Protocol ID 35")).toHaveAttribute("data-protocol-status", "failed"));
        await act(async () => finishOld({ id: "34", status: "finished" }));
        expect(screen.getByLabelText("Protocol ID 35").style.backgroundColor).toBe("var(--app-red-100)");
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
        expect(screen.getByLabelText("Protocol ID 34")).toHaveTextContent("34");
        expect(screen.getByLabelText("Protocol ID 34").nextElementSibling).toHaveTextContent("Prot A");
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

    it("renders the coords3d viewer for SetOfCoordinates3D outputs", async () => {
        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    outputRaw: {
                        _class: "SetOfCoordinates3D",
                    },
                })}
            />,
        );

        expect(await screen.findByText("Mock Coords3dViewer")).toBeInTheDocument();
        expect(mocks.coords3dViewerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 12,
                protocolId: 34,
                protocolLabel: "Prot A",
                outputName: "outputA",
            }),
        );
    });

    it("renders the tilt series viewer for SetOfTiltSeries outputs", async () => {
        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    outputRaw: {
                        _class: "SetOfTiltSeries",
                    },
                })}
            />,
        );

        expect(await screen.findByText("Mock TiltSeriesViewer")).toBeInTheDocument();
        expect(mocks.tiltSeriesViewerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 12,
                protocolId: 34,
                outputName: "outputA",
            }),
        );
    });

    it("renders the CTF tomo viewer for SetOfCTFTomoSeries outputs", async () => {
        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    outputRaw: {
                        _class: "SetOfCTFTomoSeries",
                    },
                })}
            />,
        );

        expect(await screen.findByText("Mock CTFTomoViewer")).toBeInTheDocument();
        expect(mocks.ctfTomoViewerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 12,
                protocolId: 34,
                outputName: "outputA",
            }),
        );
    });

    it("renders the CTF viewer for SetOfCTF outputs", async () => {
        render(
            <AnalyzeOutputDialog
                {...makeProps({
                    outputRaw: {
                        _class: "SetOfCTF",
                    },
                })}
            />,
        );

        expect(
            await screen.findByText("Mock CtfViewer"),
        ).toBeInTheDocument();

        expect(
            mocks.ctfViewerSpy,
        ).toHaveBeenCalledWith(
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

    it.each(["TomoMask", "SetOfTomoMasks"])("opens a %s in the volume viewer", (className) => {
        render(<AnalyzeOutputDialog {...makeProps({ outputRaw: { _class: className } })} />);

        expect(screen.getByText("Mock VolumeViewer")).toBeInTheDocument();
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

    it(
        "renders the analyze viewer as a non-modal floating window",
        () => {
            render(
                <AnalyzeOutputDialog
                    {...makeProps()}
                />,
            );

            const dialog =
                screen.getByRole(
                    "dialog",
                    {
                        name:
                            "Analyze result outputA",
                    },
                );

            expect(
                dialog,
            ).toHaveAttribute(
                "aria-modal",
                "false",
            );

            expect(
                dialog.style.width,
            ).toBe(
                "80vw",
            );


            expect(
                dialog.style.height,
            ).toBe(
                "84vh",
            );

            expect(
                screen.getByRole(
                    "button",
                    {
                        name:
                            "Maximize window",
                    },
                ),
            ).toBeInTheDocument();
        },
    );
    it(
        "moves the viewer to an external window and returns it to ScipionWeb",
        () => {
            const iframe =
                document.createElement(
                    "iframe",
                );

            document.body.appendChild(
                iframe,
            );

            const popup =
                iframe.contentWindow;

            if (!popup) {
                throw new Error(
                    "Unable to create test popup window",
                );
            }

            const closeMock =
                vi.fn();

            const focusMock =
                vi.fn();

            Object.defineProperty(
                popup,
                "close",
                {
                    configurable:
                        true,

                    value:
                        closeMock,
                },
            );

            Object.defineProperty(
                popup,
                "focus",
                {
                    configurable:
                        true,

                    value:
                        focusMock,
                },
            );

            const openSpy =
                vi.spyOn(
                    window,
                    "open",
                )
                    .mockReturnValue(
                        popup,
                    );


            render(
                <AnalyzeOutputDialog
                    {...makeProps({
                        outputRaw: {
                            _class:
                                "SetOfParticles",
                        },
                    })}
                />,
            );


            expect(
                screen.getByText(
                    "Mock MetadataViewer",
                ),
            ).toBeInTheDocument();


            fireEvent.click(
                screen.getByRole(
                    "button",
                    {
                        name:
                            "Open viewer in external window",
                    },
                ),
            );


            expect(
                openSpy,
            ).toHaveBeenCalledTimes(
                1,
            );

            const externalDocument =
                within(
                    popup.document.body,
                );


            expect(externalDocument.getByLabelText("Protocol ID 34")).toHaveTextContent("34");

            const externalViewer =
                externalDocument.getByText(
                    "Mock MetadataViewer",
                );


            expect(
                externalViewer
                    .ownerDocument,
            ).toBe(
                popup.document,
            );


            expect(
                popup.document.body
                    .contains(
                        externalViewer,
                    ),
            ).toBe(
                true,
            );


            expect(
                screen.queryByRole(
                    "dialog",
                    {
                        name:
                            "Analyze result outputA",
                    },
                ),
            ).not.toBeInTheDocument();


            fireEvent.click(
                externalDocument.getByRole(
                    "button",
                    {
                        name:
                            "Return viewer to ScipionWeb",
                    },
                ),
            );


            expect(
                screen.getByRole(
                    "dialog",
                    {
                        name:
                            "Analyze result outputA",
                    },
                ),
            ).toBeInTheDocument();


            expect(
                screen.getByText(
                    "Mock MetadataViewer",
                ),
            ).toBeInTheDocument();


            expect(
                closeMock,
            ).toHaveBeenCalledTimes(
                1,
            );


            openSpy.mockRestore();

            iframe.remove();
        },
    );

    it("calls onClose when the close button is clicked", () => {
        const onClose = vi.fn();

        render(<AnalyzeOutputDialog {...makeProps({ onClose })} />);

        fireEvent.click(
            screen.getByRole("button", { name: "Close analyze dialog" }),
        );

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not propagate viewer double-clicks outside the analyze dialog", () => {
        const onDoubleClick = vi.fn();

        render(
            <div onDoubleClick={onDoubleClick}>
                <AnalyzeOutputDialog
                    {...makeProps({
                        outputRaw: {
                            _class: "SetOfParticles",
                        },
                    })}
                />
            </div>,
        );

        fireEvent.doubleClick(screen.getByText("Mock MetadataViewer"));

        expect(onDoubleClick).not.toHaveBeenCalled();
    });
});