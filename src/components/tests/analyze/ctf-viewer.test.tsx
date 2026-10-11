import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";

import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";


const serviceMocks =
    vi.hoisted(() => ({
        listOutputCTFs: vi.fn(),
        fetchCTFPsdImageObjectUrl: vi.fn(),
        fetchCTFMicrographImageObjectUrl: vi.fn(),
    }));


vi.mock(
    "@/ProjectServiceContext",
    () => ({
        useProjectService: () =>
            serviceMocks,
    }),
);


vi.mock(
    "react-plotly.js",
    () => ({
        default: ({
            onClick,
        }: {
            onClick?: (
                event: unknown,
            ) => void;
        }) => (
            <div data-testid="mock-plotly">
                <button
                    type="button"
                    onClick={() =>
                        onClick?.({
                            points: [
                                {
                                    customdata: [
                                        "2",
                                        "mic_002",
                                    ],
                                },
                            ],
                            event: {
                                button: 0,
                            },
                        })
                    }
                >
                    select-ctf-2
                </button>
            </div>
        ),
    }),
);


vi.mock(
    "../../analyze/metadata-viewer",
    () => ({
        MetadataViewer: ({
            outputName,
        }: {
            outputName: string;
        }) => (
            <div>
                Mock MetadataViewer {outputName}
            </div>
        ),
    }),
);


import CtfViewer
    from "../../analyze/ctf-viewer";


function makePayload() {
    return {
        total: 2,
        ctfs: [
            {
                ctfId: "1",
                position: 0,
                micrographId: "1",
                micrographName: "mic_001",
                excluded: false,
                failed: false,
                defocusU: 22000,
                defocusV: 21000,
                astigmatism: 1000,
                defocusAngle: 30,
                resolution: 4.2,
                fitQuality: 0.91,
                phaseShift: 0.1,
                psdFile:
                    "Runs/000001/psd_001.mrc",
            },
            {
                ctfId: "2",
                position: 1,
                micrographId: "2",
                micrographName: "mic_002",
                excluded: false,
                failed: true,
                defocusU: -999,
                defocusV: -1,
                psdFile:
                    "Runs/000001/psd_002.mrc",
            },
        ],
    };
}


describe(
    "CtfViewer",
    () => {
        beforeEach(() => {
            vi.clearAllMocks();

            serviceMocks
                .listOutputCTFs
                .mockResolvedValue(
                    makePayload(),
                );

            serviceMocks
                .fetchCTFMicrographImageObjectUrl
                .mockImplementation(
                    async (
                        _projectId,
                        _protocolId,
                        _outputName,
                        ctfId,
                    ) => ({
                        url:
                            `blob:micrograph-${ctfId}`,
                        revoke: vi.fn(),
                    }),
                );

            serviceMocks
                .fetchCTFPsdImageObjectUrl
                .mockImplementation(
                    async (
                        _projectId,
                        _protocolId,
                        _outputName,
                        ctfId,
                    ) => ({
                        url:
                            `blob:psd-${ctfId}`,
                        revoke: vi.fn(),
                    }),
                );
        });


        it(
            "selects the first CTF and loads its micrograph and PSD by default",
            async () => {
                render(
                    <CtfViewer
                        projectId={1}
                        protocolId={2}
                        outputName="outputCTF"
                    />,
                );

                expect(
                    await screen.findAllByText(
                        "mic_001",
                    ),
                ).not.toHaveLength(0);

                await waitFor(() => {
                    expect(
                        serviceMocks
                            .fetchCTFMicrographImageObjectUrl,
                    ).toHaveBeenCalledWith(
                        1,
                        2,
                        "outputCTF",
                        "1",
                        expect.objectContaining({
                            size: 1024,
                        }),
                    );

                    expect(
                        serviceMocks
                            .fetchCTFPsdImageObjectUrl,
                    ).toHaveBeenCalledWith(
                        1,
                        2,
                        "outputCTF",
                        "1",
                        expect.objectContaining({
                            size: 1024,
                        }),
                    );
                });
            },
        );


        it.each([
            ["micrograph", "Selected CTF micrograph", "fetchCTFMicrographImageObjectUrl"],
            ["psd", "Selected CTF PSD", "fetchCTFPsdImageObjectUrl"],
        ] as const)("opens the shared image viewer for the %s and releases only its own image", async (kind, alt, method) => {
            render(<CtfViewer projectId={1} protocolId={2} outputName="outputCTF" />);
            const thumbnail = await screen.findByAltText(alt);
            const thumbnailUrl = thumbnail.getAttribute("src");
            const revoke = vi.fn();
            serviceMocks[method].mockResolvedValueOnce({ url: `blob:detail-${kind}`, revoke });

            fireEvent.doubleClick(thumbnail);
            const dialog = await screen.findByRole("dialog", { name: "Image preview" });
            const image = await within(dialog).findByRole("img");
            expect(image).toHaveAttribute("src", `blob:detail-${kind}`);
            expect(serviceMocks[method]).toHaveBeenLastCalledWith(1, 2, "outputCTF", "1", expect.objectContaining({ size: 1024, signal: expect.any(AbortSignal) }));
            expect(thumbnail).toHaveAttribute("src", thumbnailUrl);

            fireEvent.click(within(dialog).getByRole("button", { name: "Zoom in" }));
            expect(within(dialog).getByTestId("preview-zoom-level")).toHaveTextContent("125%");
            expect(within(dialog).getByRole("slider", { name: "Brightness" })).toBeEnabled();
            expect(within(dialog).getByRole("button", { name: "Open image preview in external window" })).toBeEnabled();

            fireEvent.click(within(dialog).getByRole("button", { name: "Close image preview" }));
            await waitFor(() => expect(screen.queryByRole("dialog", { name: "Image preview" })).not.toBeInTheDocument());
            expect(revoke).toHaveBeenCalledTimes(1);
            expect(thumbnail).toHaveAttribute("src", thumbnailUrl);
        });

        it("closes and cancels a pending image when selecting another CTF", async () => {
            render(<CtfViewer projectId={1} protocolId={2} outputName="outputCTF" />);
            const thumbnail = await screen.findByAltText("Selected CTF micrograph");
            let resolve!: (result: { url: string; revoke: () => void }) => void;
            serviceMocks.fetchCTFMicrographImageObjectUrl.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));

            fireEvent.doubleClick(thumbnail);
            await screen.findByRole("dialog", { name: "Image preview" });
            const calls = serviceMocks.fetchCTFMicrographImageObjectUrl.mock.calls;
            const signal = calls[calls.length - 1][4].signal as AbortSignal;
            fireEvent.click(screen.getByText("mic_002"));
            await waitFor(() => expect(screen.queryByRole("dialog", { name: "Image preview" })).not.toBeInTheDocument());
            expect(signal.aborted).toBe(true);

            const revoke = vi.fn();
            await act(async () => resolve({ url: "blob:stale-detail", revoke }));
            expect(revoke).toHaveBeenCalledTimes(1);
            expect(screen.getByAltText("Selected CTF micrograph")).toHaveAttribute("src", "blob:micrograph-2");
        });

        it("keeps a new PSD preview when an older micrograph request finishes late", async () => {
            render(<CtfViewer projectId={1} protocolId={2} outputName="outputCTF" />);
            const thumbnail = await screen.findByAltText("Selected CTF micrograph");
            let resolve!: (result: { url: string; revoke: () => void }) => void;
            serviceMocks.fetchCTFMicrographImageObjectUrl.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
            fireEvent.doubleClick(thumbnail);
            await screen.findByRole("dialog", { name: "Image preview" });
            const calls = serviceMocks.fetchCTFMicrographImageObjectUrl.mock.calls;
            const signal = calls[calls.length - 1][4].signal as AbortSignal;

            serviceMocks.fetchCTFPsdImageObjectUrl.mockResolvedValueOnce({ url: "blob:detail-psd", revoke: vi.fn() });
            fireEvent.click(screen.getByRole("button", { name: "Open PSD image" }));
            const dialog = await screen.findByRole("dialog", { name: "Image preview" });
            await waitFor(() => expect(within(dialog).getByRole("img")).toHaveAttribute("src", "blob:detail-psd"));
            expect(signal.aborted).toBe(true);

            const revoke = vi.fn();
            await act(async () => resolve({ url: "blob:stale-micrograph", revoke }));
            expect(revoke).toHaveBeenCalledTimes(1);
            expect(within(dialog).getByRole("img")).toHaveAttribute("src", "blob:detail-psd");
        });

        it(
            "identifies failed CTFs without a status column",
            async () => {
                render(
                    <CtfViewer
                        projectId={1}
                        protocolId={2}
                        outputName="outputCTF"
                    />,
                );

                expect(
                    await screen.findByTitle(
                        "Failed CTF",
                    ),
                ).toBeInTheDocument();

                expect(
                    screen.queryByRole("columnheader", { name: "Status" }),
                ).not.toBeInTheDocument();

                expect(
                    screen.getByText(
                        "2 CTFs · 1 failed",
                    ),
                ).toBeInTheDocument();
            },
        );


        it(
            "selects the CTF from the plot",
            async () => {
                render(
                    <CtfViewer
                        projectId={1}
                        protocolId={2}
                        outputName="outputCTF"
                    />,
                );

                await screen.findByTestId(
                    "mock-plotly",
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name: "select-ctf-2",
                        },
                    ),
                );

                await waitFor(() => {
                    expect(
                        serviceMocks
                            .fetchCTFMicrographImageObjectUrl,
                    ).toHaveBeenLastCalledWith(
                        1,
                        2,
                        "outputCTF",
                        "2",
                        expect.any(Object),
                    );
                });
            },
        );


        it(
            "opens the metadata viewer",
            async () => {
                render(
                    <CtfViewer
                        projectId={1}
                        protocolId={2}
                        outputName="outputCTF"
                    />,
                );

                await screen.findAllByText(
                    "mic_001",
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name: "Metadata",
                        },
                    ),
                );

                expect(
                    screen.getByText(
                        "Mock MetadataViewer outputCTF",
                    ),
                ).toBeInTheDocument();

                expect(
                    screen.getByRole(
                        "button",
                        {
                            name: "CTF viewer",
                        },
                    ),
                ).toBeInTheDocument();
            },
        );

        it(
            "shows CTF summary statistics",
            async () => {
                render(
                    <CtfViewer
                        projectId={1}
                        protocolId={2}
                        outputName="outputCTF"
                    />,
                );

                await screen.findAllByText("mic_001");

                expect(
                    screen.getByText("Median defocus"),
                ).toBeInTheDocument();

                expect(
                    screen.getByText("2.150 µm"),
                ).toBeInTheDocument();

                expect(
                    screen.getByText("4.20 Å"),
                ).toBeInTheDocument();

                expect(
                    screen.getByText("1000.00 Å"),
                ).toBeInTheDocument();
            },
        );


        it(
            "switches between trends, quality map and distributions",
            async () => {
                render(
                    <CtfViewer
                        projectId={1}
                        protocolId={2}
                        outputName="outputCTF"
                    />,
                );

                await screen.findByText("CTF trends");

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        { name: "Quality map" },
                    ),
                );

                expect(
                    screen.getByText("CTF quality map"),
                ).toBeInTheDocument();

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        { name: "Distributions" },
                    ),
                );

                expect(
                    screen.getByText("CTF distributions"),
                ).toBeInTheDocument();

                expect(
                    screen.getByRole("combobox"),
                ).toBeInTheDocument();
            },
        );
    },
);
