import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolForm from "@/components/protocol/ProtocolForm";

const mockSaveProtocol = vi.fn();
const mockExecuteProtocol = vi.fn();

const mockGetBackendPayloadFromError = vi.fn((error: any): any => error?.payload ?? error ?? null);
const mockGetHttpStatusFromError = vi.fn((error: any): number | null => error?.status ?? null);
const mockGetErrorsFromBackendPayload = vi.fn((_: any): string[] => []);
const mockFormatErrorsForDialog = vi.fn((errors: string[]): string => errors.join("\n"));

const mockProjectService = {
    saveProtocol: mockSaveProtocol,
    executeProtocol: mockExecuteProtocol,
    resolveBrowserPaths: vi.fn(),
    listRemoteDirectory: vi.fn(),
    previewRemoteEntry: vi.fn(),
    buildProtocolDownloadUrl: vi.fn(),
};

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/utils/protocolform.errors", () => ({
    getBackendPayloadFromError: (error: any) => mockGetBackendPayloadFromError(error),
    getHttpStatusFromError: (error: any) => mockGetHttpStatusFromError(error),
    getErrorsFromBackendPayload: (payload: any) => mockGetErrorsFromBackendPayload(payload),
    formatErrorsForDialog: (errors: string[]) => mockFormatErrorsForDialog(errors),
}));

vi.mock("react-hot-toast", () => ({
    default: {
        success: (...args: any[]) => mockToastSuccess(...args),
        error: (...args: any[]) => mockToastError(...args),
    },
}));

vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: () => mockProjectService,
}));

vi.mock("@/context/ThemeContext", () => ({
    useTheme: () => ({
        theme:
            "light",

        toggleTheme:
            vi.fn(),

        setThemeMode:
            vi.fn(),
    }),
}));

vi.mock("@/hooks/useProtocolLogs", () => ({
    useProtocolLogs: () => ({
        sortedLogChannels: [],
        activeLogChannelId: "stdout",
        setActiveLogChannelId: vi.fn(),
        activeLogText: "",
        logsError: null,
        logsContainerRef: { current: null },
        updateStickToBottom: vi.fn(),
    }),
}));

vi.mock("@/utils/protocolform.utils", () => ({
    getParamClass: (def: any) => def?.paramClass ?? "",
    isNonEmptyString: (value: any) =>
        typeof value === "string" && value.trim().length > 0,
    resolveParamClass: (def: any) => def?.paramClass ?? "",
    withResolvedParamClass: (def: any) => def,
    unwrapParamDef: (paramLike: any) => ({
        paramName: paramLike?.paramName ?? paramLike?.name ?? "",
        paramDef: paramLike?.paramDef ?? paramLike,
    }),
    parseFromJSONValue: (value: any) => value,
    coerceBooleanValue: (value: any) => Boolean(value),
    coerceReadOnlyFlag: (value: any) => Boolean(value),
    coerceCollapsedFlag: (value: any) => Boolean(value),
    getParamNameFromStateKey: (key: string) =>
        String(key).split("_").slice(1).join("_"),
    getInitialRawForParam: (name: string, def: any, valuesMap: any) =>
        valuesMap?.[name] ?? def?.value ?? def?.default ?? "",
    normalizePointerToken: (value: any) => String(value ?? "").trim(),
    normalizeEnumOptions: () => [],
    normalizeEnumSelection: (value: any) => value,
    normalizeMultiPointerValue: (value: any) =>
        Array.isArray(value) ? value : [],
    isScalarPointerParam: (def: any) =>
        def?.allowsPointers === true &&
        def?.paramClass !== "PointerParam" &&
        def?.paramClass !== "MultiPointerParam" &&
        def?.paramClass !== "RelationParam",
}));

vi.mock("@/components/protocol/ProtocolFormRenderers", () => ({
    renderPointerParamRow: ({ label }: any) => <div>{label}</div>,
    renderPathParamRow: ({ label }: any) => <div>{label}</div>,
    renderEnumParamRow: ({ label }: any) => <div>{label}</div>,
    renderBooleanParamRow: ({ label }: any) => <div>{label}</div>,
    renderDefaultParamRow: ({ label, value }: any) => (
        <div>
            <span>{label}</span>
            <input aria-label={label} value={value ?? ""} readOnly />
        </div>
    ),
}));

vi.mock("@/components/protocol/ProtocolLogsPanel", () => ({
    default: () => <div data-testid="logs-panel">Logs panel</div>,
}));

vi.mock("@/components/protocol/ProtocolOutputsPanel", () => ({
    default: () => <div data-testid="outputs-panel">Outputs panel</div>,
}));

vi.mock("@/components/protocol/ProtocolMetadataPanel", () => ({
    default: () => <div data-testid="metadata-panel">Metadata panel</div>,
}));

vi.mock("@/components/protocol/ProtocolHelpDialog", () => ({
    default: ({ open, text }: { open: boolean; text: string }) =>
        open ? <div data-testid="protocol-help-dialog">{text}</div> : null,
}));

vi.mock("@/components/protocol/ExecErrorDialog", () => ({
    default: ({ open, message }: { open: boolean; message: string }) =>
        open ? <div data-testid="exec-error-dialog">{message}</div> : null,
}));

vi.mock("@/components/protocol/ValidationErrorsDialog", () => ({
    default: ({ open, errors }: { open: boolean; errors: string[] }) =>
        open ? <div data-testid="validation-dialog">{errors.join(", ")}</div> : null,
}));

vi.mock("@/components/files/RemoteFileDialog", () => ({
    default: ({ open }: { open: boolean }) =>
        open ? <div data-testid="remote-file-dialog">Remote file dialog</div> : null,
}));

vi.mock("@/components/protocol/outputSelectorDialog", () => ({
    default: ({ open }: { open: boolean }) =>
        open ? <div data-testid="output-selector-dialog">Output selector dialog</div> : null,
}));

vi.mock("@/components/protocol/ExecuteModeButton", () => ({
    default: ({
        onExecute,
        selectedMode,
    }: {
        onExecute: (mode: string) => void;
        selectedMode: string | null;
    }) => (
        <button onClick={() => onExecute(selectedMode || "launch")}>
            Execute mode button
        </button>
    ),
}));

vi.mock("@/components/protocol/wizards/WizardLoadingDialog", () => ({
    default: ({ open }: { open: boolean }) =>
        open ? <div data-testid="wizard-loading-dialog">Wizard loading</div> : null,
}));

vi.mock("@/components/protocol/wizards/wizard-dialog-host", () => ({
    default: () => <div data-testid="wizard-dialog-host">Wizard host</div>,
}));

vi.mock("@/components/protocol/wizards/use_protocol_wizards", () => ({
    useProtocolWizards: () => ({
        wizardState: { open: false, kind: "options" },
        openingWizard: { open: false, title: "", message: "" },
        interactivePreviewLoading: false,
        openWizardForParam: vi.fn(),
        closeWizard: vi.fn(),
        confirmWizard: vi.fn(),
        setOptionsSelectedValue: vi.fn(),
        setInputFieldValue: vi.fn(),
        setMaskRadiusValue: vi.fn(),
        commitMaskRadiusValue: vi.fn(),
        setMaskRadiusSelectedIndex: vi.fn(),
        setMaskRadiiInnerValue: vi.fn(),
        commitMaskRadiiInnerValue: vi.fn(),
        setMaskRadiiOuterValue: vi.fn(),
        commitMaskRadiiOuterValue: vi.fn(),
        setMaskRadiiSelectedIndex: vi.fn(),
        setCtfDownsampleValue: vi.fn(),
        commitCtfDownsampleValue: vi.fn(),
        setCtfLowFreqValue: vi.fn(),
        commitCtfLowFreqValue: vi.fn(),
        setCtfHighFreqValue: vi.fn(),
        commitCtfHighFreqValue: vi.fn(),
        setCtfSelectedIndex: vi.fn(),
        setFilterLowFreqValue: vi.fn(),
        commitFilterLowFreqValue: vi.fn(),
        setFilterHighFreqValue: vi.fn(),
        commitFilterHighFreqValue: vi.fn(),
        setFilterDecayValue: vi.fn(),
        commitFilterDecayValue: vi.fn(),
        setFilterSelectedIndex: vi.fn(),
        setDownsamplePreviewValue: vi.fn(),
        commitDownsamplePreviewValue: vi.fn(),
        setDownsamplePreviewSelectedIndex: vi.fn(),
        setPointInVolumePoint: vi.fn(),
        setPointInVolumeVoxel: vi.fn(),
    }),
}));

vi.mock("@/icons", () => ({
    ChevronDownIcon: (props: any) => <svg data-testid="chevron-down-icon" {...props} />,
    ChevronUpIcon: (props: any) => <svg data-testid="chevron-up-icon" {...props} />,
    CloseIcon: (props: any) => <svg data-testid="close-icon" {...props} />,
    ExecuteIcon: (props: any) => <svg data-testid="execute-icon" {...props} />,
    SaveIcon: (props: any) => <svg data-testid="save-icon" {...props} />,
    HelpIcon: (props: any) => <svg data-testid="help-icon" {...props} />,
}));

function createData() {
    return {
        info: {
            projectId: 1,
            protocolId: 7,
            protocolName: "Import Movies",
            status: "saved",
            color: "#00ff00",
            protocolClassName: "ProtImportMovies",
            outputs: [],
            executeMode: null,
        },
        form: {
            help: "This is the protocol help text",
            sections: [
                {
                    label: "Main",
                    params: [
                        {
                            paramName: "inputLabel",
                            paramDef: {
                                paramClass: "StringParam",
                                label: "Input label",
                                default: "hello",
                            },
                        },
                    ],
                },
            ],
        },
        values: {
            inputLabel: "hello",
        },
    };
}

function renderComponent(
    overrides: Partial<React.ComponentProps<typeof ProtocolForm>> = {},
) {
    const onClose = vi.fn();
    const onExecuted = vi.fn();

    render(
        <ProtocolForm
            data={createData()}
            projectProtocols={[]}
            onClose={onClose}
            onExecuted={onExecuted}
            variant="docked"
            projectEffectiveSettings={null}
            {...overrides}
        />,
    );

    return { onClose, onExecuted };
}

function createQueueData() {
    return {
        info: {
            projectId: 1,
            protocolId: 7,
            protocolName: "Import Movies",
            status: "saved",
            color: "#00ff00",
            protocolClassName: "ProtImportMovies",
            outputs: [],
            executeMode: null,
        },
        form: {
            help: "This is the protocol help text",
            sections: [
                {
                    label: "Main",
                    params: [
                        {
                            paramName: "inputLabel",
                            paramDef: {
                                paramClass: "StringParam",
                                label: "Input label",
                                default: "hello",
                            },
                        },
                        {
                            paramName: "useQueue",
                            paramDef: {
                                paramClass: "BooleanParam",
                                label: "Use queue",
                                default: false,
                            },
                        },
                        {
                            paramName: "queueName",
                            paramDef: {
                                paramClass: "StringParam",
                                label: "Queue name",
                                default: "gpu",
                            },
                        },
                        {
                            paramName: "threads",
                            paramDef: {
                                paramClass: "StringParam",
                                label: "Threads",
                                default: "",
                            },
                        },
                    ],
                },
            ],
        },
        values: {
            inputLabel: "hello",
            useQueue: true,
            queueName: "gpu",
            threads: "",
        },
    };
}

function renderQueueComponent(
    overrides: Partial<React.ComponentProps<typeof ProtocolForm>> = {},
) {
    const onClose = vi.fn();
    const onExecuted = vi.fn();

    render(
        <ProtocolForm
            data={createQueueData()}
            projectProtocols={[]}
            onClose={onClose}
            onExecuted={onExecuted}
            variant="docked"
            projectEffectiveSettings={{
                projectId: 1,
                settings: {
                    user: {},
                    instance: {},
                    host: {
                        mandatory: false,
                        queues: [
                            {
                                name: "gpu",
                                params: [
                                    {
                                        variableName: "threads",
                                        value: "8",
                                        label: "Threads",
                                        help: "Queue threads",
                                    },
                                ],
                            },
                        ],
                    },
                },
            }}
            {...overrides}
        />,
    );

    return { onClose, onExecuted };
}

describe("ProtocolForm", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSaveProtocol.mockResolvedValue({ protocolId: 7 });
        mockExecuteProtocol.mockResolvedValue({});
        mockGetBackendPayloadFromError.mockImplementation((error) => error?.payload ?? error ?? null);
        mockGetHttpStatusFromError.mockImplementation((error) => error?.status ?? null);
        mockGetErrorsFromBackendPayload.mockReturnValue([]);
        mockFormatErrorsForDialog.mockImplementation((errors) => errors.join("\n"));
    });

    it("renders parameters with a literal True condition", async () => {
        const data: any = createData();

        data.form.sections = [
            {
                label: "Import",
                params: [
                    {
                        paramName: "filesPath",
                        paramDef: {
                            paramClass: "PathParam",
                            label: "Files directory",
                            default: "",
                            condition: "True",
                        },
                    },
                    {
                        paramName: "filesPattern",
                        paramDef: {
                            paramClass: "StringParam",
                            label: "Pattern",
                            default: "",
                            condition: "True",
                        },
                    },
                ],
            },
        ];

        data.values = {
            filesPath: "",
            filesPattern: "",
        };

        renderComponent({ data });

        expect(
            await screen.findByText("Files directory")
        ).toBeInTheDocument();

        expect(
            screen.getByText("Pattern")
        ).toBeInTheDocument();
    });

    it("evaluates EnumParam conditions using the Scipion choice index", async () => {
        const data: any = createData();

        data.form.sections = [
            {
                label: "Import",
                params: [
                    {
                        paramName: "importFrom",
                        paramDef: {
                            paramClass: "EnumParam",
                            label: "Import from",
                            choices: [
                                "auto",
                                "xmipp",
                                "relion",
                                "eman",
                                "dogpicker",
                                "scipion",
                                "cryosparc",
                            ],
                            default: 0,
                        },
                    },
                    {
                        paramName: "scale",
                        paramDef: {
                            paramClass: "FloatParam",
                            label: "Scale",
                            default: 1,
                            condition: "importFrom!=5",
                        },
                    },
                ],
            },
        ];

        data.values = {
            importFrom: "scipion",
            scale: 1,
        };

        renderComponent({ data });

        expect(
            await screen.findByText("Import from")
        ).toBeInTheDocument();

        expect(
            screen.queryByText("Scale")
        ).not.toBeInTheDocument();
    });

    it("resolves condition parameters across form sections", async () => {
        const data: any = createData();

        data.form.sections = [
            {
                label: "Import",
                params: [
                    {
                        paramName: "importFrom",
                        paramDef: {
                            paramClass: "EnumParam",
                            label: "Import from",
                            choices: [
                                "auto",
                                "xmipp",
                                "relion",
                                "eman",
                                "dogpicker",
                                "scipion",
                                "cryosparc",
                            ],
                            default: 0,
                        },
                    },
                ],
            },
            {
                label: "Options",
                params: [
                    {
                        paramName: "scale",
                        paramDef: {
                            paramClass: "FloatParam",
                            label: "Scale",
                            default: 1,
                            condition: "importFrom!=5",
                        },
                    },
                ],
            },
        ];

        data.values = {
            importFrom: "scipion",
            scale: 1,
        };

        renderComponent({ data });

        fireEvent.click(
            screen.getByRole("tab", {
                name: "Options",
            })
        );

        expect(
            screen.queryByText("Scale")
        ).not.toBeInTheDocument();
    });


    it("reuses the created protocol after a new protocol launch fails validation", async () => {
        const data: any = createData();
        data.info.protocolId = null;
        data.info.status = "new";

        mockExecuteProtocol.mockRejectedValueOnce({ status: 422, payload: { status: 1, errors: ["DLTK is not installed"], workflow: [], protocolId: "42" } });
        mockExecuteProtocol.mockResolvedValueOnce({});
        mockGetErrorsFromBackendPayload.mockImplementation((payload: any) => Array.isArray(payload?.errors) ? payload.errors : []);

        renderComponent({ data });

        fireEvent.click(screen.getByRole("button", { name: "Launch" }));

        expect(await screen.findByTestId("validation-dialog")).toBeInTheDocument();

        await waitFor(() => {
            expect(mockExecuteProtocol).toHaveBeenCalledTimes(1);
        });

        expect(mockExecuteProtocol.mock.calls[0][1]).toBe("");

        fireEvent.click(screen.getByRole("button", { name: "Launch" }));

        await waitFor(() => {
            expect(mockExecuteProtocol).toHaveBeenCalledTimes(2);
        });

        expect(mockExecuteProtocol.mock.calls[1][1]).toBe("42");
    });

    it("renders the protocol header, top tabs and first section", async () => {
        renderComponent();

        expect(screen.getByText("Import Movies")).toBeInTheDocument();
        expect(screen.getByText("saved")).toBeInTheDocument();
        expect(screen.getByText("7")).toBeInTheDocument();

        expect(screen.getByRole("tab", { name: "Inputs and Parameters" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Outputs" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Logs" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Metadata" })).toBeInTheDocument();

        expect(screen.getByRole("tab", { name: "Main" })).toBeInTheDocument();

        expect(await screen.findByText("Input label")).toBeInTheDocument();
        expect(screen.getByDisplayValue("hello")).toBeInTheDocument();
    });

    it("switches between Outputs, Logs and Metadata tabs", async () => {
        renderComponent();

        fireEvent.click(screen.getByRole("tab", { name: "Outputs" }));
        expect(await screen.findByTestId("outputs-panel")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("tab", { name: "Logs" }));
        expect(await screen.findByTestId("logs-panel")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));
        expect(await screen.findByTestId("metadata-panel")).toBeInTheDocument();
    });

    it("opens the protocol help dialog from the header help button", async () => {
        renderComponent();

        fireEvent.click(screen.getByRole("button", { name: "Open protocol help" }));

        expect(await screen.findByTestId("protocol-help-dialog")).toBeInTheDocument();
        expect(screen.getByText("This is the protocol help text")).toBeInTheDocument();
    });

    it("calls saveProtocol with serialized params when clicking Save", async () => {
        renderComponent();

        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => {
            expect(mockSaveProtocol).toHaveBeenCalledWith(
                1,
                "7",
                "ProtImportMovies",
                { inputLabel: "hello" },
            );
        });

        expect(mockToastSuccess).toHaveBeenCalled();
    });

    it("calls executeProtocol with serialized params when clicking Launch", async () => {
        const { onExecuted } = renderComponent();

        fireEvent.click(screen.getByRole("button", { name: "Launch" }));

        await waitFor(() => {
            expect(mockExecuteProtocol).toHaveBeenCalledWith(
                1,
                "7",
                "ProtImportMovies",
                { inputLabel: "hello" },
                "launch",
            );
        });

        expect(onExecuted).toHaveBeenCalledTimes(1);
    });

    it("shows an error toast when saveProtocol throws an error", async () => {
        mockSaveProtocol.mockRejectedValue(new Error("Save failed"));

        renderComponent();

        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalledWith("Save failed");
        });
    });

    it("shows validation errors dialog when execute returns backend validation errors", async () => {
        const { onExecuted } = renderComponent();

        mockExecuteProtocol.mockResolvedValue({ some: "payload" });
        mockGetErrorsFromBackendPayload.mockReturnValueOnce(["Missing required input"]);

        fireEvent.click(screen.getByRole("button", { name: "Launch" }));

        expect(await screen.findByTestId("validation-dialog")).toBeInTheDocument();
        expect(screen.getByText("Missing required input")).toBeInTheDocument();
        expect(onExecuted).not.toHaveBeenCalled();
    });

    it("shows exec error dialog and toast when save fails with backend errors", async () => {
        renderComponent();

        mockSaveProtocol.mockRejectedValue({
            status: 500,
            payload: { detail: "backend failure" },
        });
        mockGetErrorsFromBackendPayload.mockReturnValueOnce(["Invalid queue parameter"]);

        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        const errorDialog = await screen.findByTestId("exec-error-dialog");
        expect(errorDialog).toBeInTheDocument();
        expect(errorDialog).toHaveTextContent("Invalid queue parameter");
        expect(mockToastError).toHaveBeenCalled();
    });
    it("opens the queue dialog and launches with merged queue params", async () => {
        const { onExecuted } = renderQueueComponent();

        fireEvent.click(screen.getByRole("button", { name: "Launch" }));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("Queue settings")).toBeInTheDocument();
        expect(within(dialog).getByDisplayValue("8")).toBeInTheDocument();

        fireEvent.click(within(dialog).getByRole("button", { name: "Launch" }));

        await waitFor(() => {
            expect(mockExecuteProtocol).toHaveBeenCalledWith(
                1,
                "7",
                "ProtImportMovies",
                {
                    inputLabel: "hello",
                    useQueue: true,
                    queueName: "gpu",
                    threads: "8",
                    _useQueue: true,
                    _queueName: "gpu",
                    _queueParams: {
                        threads: "8",
                    },
                },
                "launch",
            );
        });

        expect(onExecuted).toHaveBeenCalledTimes(1);
    });

    it("skips the queue dialog when queue execution is mandatory", async () => {
        const { onExecuted } = renderQueueComponent({
            projectEffectiveSettings: {
                projectId: 1,
                settings: {
                    user: {},
                    instance: {
                        defaultQueueName: "gpu",
                    },
                    host: {
                        mandatory: true,
                        queues: [
                            {
                                name: "gpu",
                                params: [
                                    {
                                        variableName: "threads",
                                        value: "8",
                                        label: "Threads",
                                        help: "Queue threads",
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        });

        fireEvent.click(screen.getByRole("button", { name: "Launch" }));

        expect(screen.queryByText("Queue settings")).not.toBeInTheDocument();

        await waitFor(() => {
            expect(mockExecuteProtocol).toHaveBeenCalledWith(
                1,
                "7",
                "ProtImportMovies",
                {
                    inputLabel: "hello",
                    useQueue: true,
                    queueName: "gpu",
                    threads: "8",
                    _useQueue: true,
                    _queueName: "gpu",
                    _queueParams: {
                        threads: "8",
                    },
                },
                "launch",
            );
        });

        expect(onExecuted).toHaveBeenCalledTimes(1);
    });

    it("hides advanced parameters at normal expert level", async () => {
        const data: any = createData();

        data.form.sections = [
            {
                label: "General",
                params: [
                    {
                        paramName: "expertLevel",
                        paramDef: {
                            paramClass: "EnumParam",
                            label: "Expert Level",
                            choices: [
                                "Normal",
                                "Advanced",
                            ],
                            default: 0,
                            expertLevel: 0,
                        },
                    },
                    {
                        paramName: "normalParam",
                        paramDef: {
                            paramClass: "StringParam",
                            label: "Normal parameter",
                            default: "normal",
                            expertLevel: 0,
                        },
                    },
                    {
                        paramName: "advancedParam",
                        paramDef: {
                            paramClass: "StringParam",
                            label: "Advanced parameter",
                            default: "advanced",
                            expertLevel: 1,
                        },
                    },
                ],
            },
        ];

        data.values = {
            expertLevel: 0,
            normalParam: "normal",
            advancedParam: "advanced",
        };

        renderComponent({ data });

        expect(
            await screen.findByText("Expert Level")
        ).toBeInTheDocument();

        expect(
            screen.getByText("Normal parameter")
        ).toBeInTheDocument();

        expect(
            screen.queryByText("Advanced parameter")
        ).not.toBeInTheDocument();
    });

    it("shows advanced parameters at advanced expert level", async () => {
        const data: any = createData();

        data.form.sections = [
            {
                label: "General",
                params: [
                    {
                        paramName: "expertLevel",
                        paramDef: {
                            paramClass: "EnumParam",
                            label: "Expert Level",
                            choices: [
                                "Normal",
                                "Advanced",
                            ],
                            default: 0,
                            expertLevel: 0,
                        },
                    },
                    {
                        paramName: "advancedParam",
                        paramDef: {
                            paramClass: "StringParam",
                            label: "Advanced parameter",
                            default: "advanced",
                            expertLevel: 1,
                        },
                    },
                ],
            },
        ];

        data.values = {
            expertLevel: 1,
            advancedParam: "advanced",
        };

        renderComponent({ data });

        expect(
            await screen.findByText("Advanced parameter")
        ).toBeInTheDocument();
    });

    it(
        "requests floating presentation from the docked header",
        () => {
            const onPresentationChange =
                vi.fn();

            renderComponent({
                onPresentationChange,
            });

            fireEvent.click(
                screen.getByRole(
                    "button",
                    {
                        name:
                            "Float protocol form",
                    },
                ),
            );

            expect(
                onPresentationChange,
            ).toHaveBeenCalledWith(
                "floating",
            );
        },
    );

    it(
        "renders as a floating window and can return to the dock",
        () => {
            const onPresentationChange =
                vi.fn();

            renderComponent({
                variant:
                    "floating",

                onPresentationChange,
            });

            expect(
                screen.getByRole(
                    "dialog",
                    {
                        name:
                            "Protocol form Import Movies",
                    },
                ),
            ).toHaveAttribute(
                "aria-modal",
                "false",
            );

            fireEvent.click(
                screen.getByRole(
                    "button",
                    {
                        name:
                            "Dock protocol form",
                    },
                ),
            );

            expect(
                onPresentationChange,
            ).toHaveBeenCalledWith(
                "docked",
            );
        },
    );

    it(
        "moves the protocol form to an external window and returns without losing the selected tab",
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
                        vi.fn(),
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


            renderComponent({
                variant:
                    "floating",

                onPresentationChange:
                    vi.fn(),
            });


            fireEvent.click(
                screen.getByRole(
                    "tab",
                    {
                        name:
                            "Outputs",
                    },
                ),
            );


            expect(
                screen.getByTestId(
                    "outputs-panel",
                ),
            ).toBeInTheDocument();


            fireEvent.click(
                screen.getByRole(
                    "button",
                    {
                        name:
                            "Open protocol form in external window",
                    },
                ),
            );


            const externalDocument =
                within(
                    popup.document.body,
                );


            const externalOutputs =
                externalDocument.getByTestId(
                    "outputs-panel",
                );


            expect(
                externalOutputs
                    .ownerDocument,
            ).toBe(
                popup.document,
            );


            expect(
                popup.document.body
                    .contains(
                        externalOutputs,
                    ),
            ).toBe(
                true,
            );


            fireEvent.click(
                externalDocument.getByRole(
                    "button",
                    {
                        name:
                            "Return protocol form to ScipionWeb",
                    },
                ),
            );


            expect(
                screen.getByTestId(
                    "outputs-panel",
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


});