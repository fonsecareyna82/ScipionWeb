import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolForm from "@/components/protocol/ProtocolForm";

const mockFetchProtocolViewerCandidates = vi.fn();
const mockSaveProtocol = vi.fn();
const mockExecuteProtocol = vi.fn();
const mockResolveProtocolRelationCandidates = vi.fn();
const mockOutputSelectorRender = vi.fn();
const mockListPointerSelectableSetItemsPage = vi.fn();

const mockGetBackendPayloadFromError = vi.fn((error: any): any => error?.payload ?? error ?? null);
const mockGetHttpStatusFromError = vi.fn((error: any): number | null => error?.status ?? null);
const mockGetErrorsFromBackendPayload = vi.fn((_: any): string[] => []);
const mockFormatErrorsForDialog = vi.fn((errors: string[]): string => errors.join("\n"));

const mockProjectService = {
    fetchProtocolViewerCandidates: mockFetchProtocolViewerCandidates,
    saveProtocol: mockSaveProtocol,
    executeProtocol: mockExecuteProtocol,
    resolveBrowserPaths: vi.fn(),
    listRemoteDirectory: vi.fn(),
    previewRemoteEntry: vi.fn(),
    buildProtocolDownloadUrl: vi.fn(),
    resolveProtocolRelationCandidates: mockResolveProtocolRelationCandidates,
    listPointerSelectableSetItemsPage: mockListPointerSelectableSetItemsPage,
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

vi.mock("@/utils/protocolform.utils", async (importOriginal) => ({
    // Retain the actual GREEN 48 generic classifier in the component tests.
    ...(await importOriginal<typeof import("@/utils/protocolform.utils")>()),
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
    matchesPointerClassHierarchy: (
        expected: any,
        output: any,
    ) => {
        const normalize = (
            value: any,
        ) =>
            String(
                value ?? ""
            )
                .replace(
                    /\s+/g,
                    ""
                )
                .toLowerCase();

        const expectedClasses =
            (
                Array.isArray(expected)
                    ? expected
                    : [expected]
            )
                .map(normalize)
                .filter(Boolean);

        const outputClasses =
            [
                output?.pointerClass,
                ...(
                    Array.isArray(
                        output?.pointerClassHierarchy
                    )
                        ? output.pointerClassHierarchy
                        : []
                ),
            ]
                .map(normalize)
                .filter(Boolean);

        return expectedClasses.some(
            (expectedClass) =>
                outputClasses.includes(
                    expectedClass
                )
        );
    },

}));

it(
    "accepts subclass outputs dropped into a MultiPointerParam",
    async () => {
        const data: any =
            createData();

        data.form.sections = [
            {
                label: "Input",
                params: [
                    {
                        paramName:
                            "inputImages",

                        paramDef: {
                            paramClass:
                                "MultiPointerParam",

                            label:
                                "Input images",

                            pointerClass:
                                "SetOfImages",
                        },
                    },
                ],
            },
        ];

        data.values = {
            inputImages: [],
        };

        renderComponent({
            data,
        });

        const rows =
            screen.getAllByRole(
                "row"
            );

        const emptyRow =
            rows[1];

        fireEvent.drop(
            emptyRow,
            {
                dataTransfer: {
                    getData: (
                        type: string,
                    ) =>
                        type ===
                            "application/scipion-output"
                            ? JSON.stringify({
                                value:
                                    "21.outputMicrographs",

                                info:
                                    "Micrographs",

                                pointerClass:
                                    "SetOfMicrographs",

                                pointerClassHierarchy: [
                                    "SetOfMicrographs",
                                    "SetOfMicrographsBase",
                                    "SetOfImages",
                                    "EMSet",
                                ],

                                parentId: 21,
                            })
                            : "",
                },
            },
        );

        expect(
            await screen.findByDisplayValue(
                "21.outputMicrographs"
            )
        ).toBeInTheDocument();
    },
);

vi.mock("@/components/protocol/ProtocolFormRenderers", () => ({
    renderPointerParamRow: ({
        label,
        stateKey,
        onOpenFind,
        protocolDetails,
        setProtocolDetails,
        def,
    }: any) => {
        const current =
            protocolDetails.params?.[
            stateKey
            ] ?? {};

        const isRelationParam =
            current.paramClass ===
            "RelationParam" ||
            def?.paramClass ===
            "RelationParam";

        return (
            <div>
                <span>{label}</span>

                <input
                    aria-label={label}
                    value={
                        current.editableValue ??
                        current.value ??
                        ""
                    }
                    readOnly={
                        isRelationParam
                    }
                    onChange={
                        isRelationParam
                            ? undefined
                            : (event) =>
                                setProtocolDetails(
                                    (prev: any) => ({
                                        ...prev,
                                        params: {
                                            ...prev.params,
                                            [stateKey]: {
                                                ...prev.params?.[
                                                stateKey
                                                ],
                                                value:
                                                    event.target.value,
                                                editableValue:
                                                    event.target.value,
                                            },
                                        },
                                    }),
                                )
                    }
                />

                <button
                    aria-label={`Find ${label}`}
                    onClick={() =>
                        onOpenFind(
                            stateKey
                        )
                    }
                >
                    Find
                </button>
            </div>
        );
    },

    renderPathParamRow: ({
        label,
    }: any) => (
        <div>{label}</div>
    ),

    renderEnumParamRow: ({
        label,
    }: any) => (
        <div>{label}</div>
    ),

    renderBooleanParamRow: ({
        label,
        wizardUi,
    }: any) => (
        <div>
            <span>{label}</span>

            {wizardUi?.hasWizard && (
                <button
                    aria-label={`${label} wizard`}
                    onClick={
                        wizardUi.onOpenWizard
                    }
                    disabled={
                        !wizardUi.onOpenWizard
                    }
                >
                    Wizard
                </button>
            )}
        </div>
    ),

    renderDefaultParamRow: ({
        label,
        value,
    }: any) => (
        <div>
            <span>{label}</span>

            <input
                aria-label={label}
                value={value ?? ""}
                readOnly
            />
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
    default: (props: any) => {
        // Capture the real props supplied by ProtocolForm. Existing tests
        // keep their lightweight dialog mock; this verifies the wiring.
        mockOutputSelectorRender(props);
        const { open, allOutputs = [], onSelect } = props;
        return open ? (
            <div data-testid="output-selector-dialog">
                {allOutputs.map(
                    (output: any) => (
                        <span
                            key={
                                `${output.protocolId}.${output.key}.${output.value}`
                            }
                            data-pointer-value={String(output.value ?? "")}
                            data-pointer-class={String(output.pointerClass ?? "")}
                            data-candidate-kind={String(output.candidateKind ?? "")}
                            data-item-class={String(output.itemClassName ?? "")}
                            data-item-hierarchy={JSON.stringify(output.itemClassHierarchy ?? [])}
                            onClick={() => onSelect?.(output)}
                        >
                            {`${output.protocolId}.${output.key}`}
                        </span>
                    )
                )}
            </div>
        ) : null;
    },
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
    FindIcon: (props: any) => <svg data-testid="find-icon" {...props} />,
    HelpIcon: (props: any) => <svg data-testid="help-icon" {...props} />,
    TrashBinIcon: (props: any) => <svg data-testid="trash-bin-icon" {...props} />,
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
        mockResolveProtocolRelationCandidates
            .mockResolvedValue({
                paramName:
                    "ctfRelations",
                relationName:
                    "relation_ctf",
                values: [],
            });
    });

    it("filters RelationParam outputs using backend relation candidates", async () => {
        const data: any =
            createData();

        data.info.protocolClassName =
            "XmippProtExtractParticles";

        data.form.sections = [
            {
                label: "Input",
                params: [
                    {
                        paramName:
                            "inputCoordinates",
                        paramDef: {
                            paramClass:
                                "PointerParam",
                            label:
                                "Input coordinates",
                            pointerClass:
                                "SetOfCoordinates",
                        },
                    },
                    {
                        paramName:
                            "ctfRelations",
                        paramDef: {
                            paramClass:
                                "RelationParam",
                            label:
                                "CTF estimation",
                            condition:
                                "inputCoordinates is not None",
                            relationName:
                                "relation_ctf",
                            attributeName:
                                "getInputMicrographs",
                            direction: 0,
                        },
                    },
                ],
            },
        ];

        data.values = {
            inputCoordinates:
                "12.outputCoordinates",
            ctfRelations:
                "",
        };

        mockResolveProtocolRelationCandidates
            .mockResolvedValueOnce({
                paramName:
                    "ctfRelations",
                relationName:
                    "relation_ctf",
                values: [
                    "21.outputCTF",
                    "44.outputCTF",
                ],
            });

        const projectProtocols = [
            {
                id: 21,
                label: "CTF 21",
                children: [],
                outputs: [
                    {
                        outputName:
                            "outputCTF",
                        pointerClass:
                            "SetOfCTF",
                        value:
                            "whatever.outputCTF",
                    },
                ],
            },
            {
                id: 44,
                label: "CTF 44",
                children: [],
                outputs: [
                    {
                        outputName:
                            "outputCTF",
                        pointerClass:
                            "SetOfCTF",
                        value:
                            "another.outputCTF",
                    },
                ],
            },
            {
                id: 55,
                label: "CTF 55",
                children: [],
                outputs: [
                    {
                        outputName:
                            "outputCTF",
                        pointerClass:
                            "SetOfCTF",
                        value:
                            "not-related.outputCTF",
                    },
                ],
            },
        ];

        renderComponent({
            data,
            projectProtocols,
        });

        expect(
            await screen.findByText(
                "CTF estimation"
            )
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole(
                "button",
                {
                    name:
                        "Find CTF estimation",
                },
            )
        );

        await waitFor(() => {
            expect(
                mockResolveProtocolRelationCandidates
            ).toHaveBeenCalledWith(
                1,
                {
                    protocolClassName:
                        "XmippProtExtractParticles",
                    paramName:
                        "ctfRelations",
                    formValues:
                        expect.objectContaining({
                            inputCoordinates:
                                "12.outputCoordinates",
                        }),
                },
            );
        });

        expect(
            await screen.findByText(
                "21.outputCTF"
            )
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "44.outputCTF"
            )
        ).toBeInTheDocument();

        expect(
            screen.queryByText(
                "55.outputCTF"
            )
        ).not.toBeInTheDocument();
    });


    it("shows RelationParam candidate when project protocol id comes from the protocol map key", async () => {
        const data: any =
            createData();

        data.info.protocolClassName =
            "XmippProtExtractParticles";

        data.form.sections = [
            {
                label: "Input",
                params: [
                    {
                        paramName:
                            "inputCoordinates",
                        paramDef: {
                            paramClass:
                                "PointerParam",
                            label:
                                "Input coordinates",
                            pointerClass:
                                "SetOfCoordinates",
                        },
                    },
                    {
                        paramName:
                            "ctfRelations",
                        paramDef: {
                            paramClass:
                                "RelationParam",
                            label:
                                "CTF estimation",
                            condition:
                                "inputCoordinates is not None",
                            relationName:
                                "relation_ctf",
                            attributeName:
                                "getInputMicrographs",
                            direction: 0,
                        },
                    },
                ],
            },
        ];

        data.values = {
            inputCoordinates:
                "3170.outputCoordinates_Full",
            ctfRelations:
                "",
        };

        mockResolveProtocolRelationCandidates
            .mockResolvedValueOnce({
                paramName:
                    "ctfRelations",
                relationName:
                    "relation_ctf",
                values: [
                    "2640.outputCTF",
                ],
            });

        const projectProtocols: any = {
            "2640": {
                label:
                    "CTF 2640",
                children: [],
                outputs: [
                    {
                        outputName:
                            "outputCTF",
                        pointerClass:
                            "SetOfCTF",
                        pointerClassHierarchy: [
                            "SetOfCTF",
                            "EMSet",
                        ],
                        value:
                            "2640.outputCTF",
                    },
                ],
            },
        };

        renderComponent({
            data,
            projectProtocols,
        });

        expect(
            await screen.findByText(
                "CTF estimation"
            )
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole(
                "button",
                {
                    name:
                        "Find CTF estimation",
                },
            )
        );

        await waitFor(() => {
            expect(
                mockResolveProtocolRelationCandidates
            ).toHaveBeenCalledWith(
                1,
                {
                    protocolClassName:
                        "XmippProtExtractParticles",
                    paramName:
                        "ctfRelations",
                    formValues:
                        expect.objectContaining({
                            inputCoordinates:
                                "3170.outputCoordinates_Full",
                        }),
                },
            );
        });

        expect(
            await screen.findByText(
                "2640.outputCTF"
            )
        ).toBeInTheDocument();
    });

    it("hides RelationParam when its is not None condition is false", async () => {
        const data: any =
            createData();

        data.info.protocolClassName =
            "XmippProtExtractParticles";

        data.form.sections = [
            {
                label: "Input",
                params: [
                    {
                        paramName:
                            "inputCoordinates",
                        paramDef: {
                            paramClass:
                                "PointerParam",
                            label:
                                "Input coordinates",
                            pointerClass:
                                "SetOfCoordinates",
                        },
                    },
                    {
                        paramName:
                            "ctfRelations",
                        paramDef: {
                            paramClass:
                                "RelationParam",
                            label:
                                "CTF estimation",
                            condition:
                                "inputCoordinates is not None",
                            relationName:
                                "relation_ctf",
                            attributeName:
                                "getInputMicrographs",
                            direction: 0,
                        },
                    },
                ],
            },
        ];

        data.values = {
            inputCoordinates: "",
            ctfRelations: "",
        };

        renderComponent({
            data,
        });

        expect(
            screen.queryByText(
                "CTF estimation"
            )
        ).not.toBeInTheDocument();

        expect(
            mockResolveProtocolRelationCandidates
        ).not.toHaveBeenCalled();
    });


    it("clears a RelationParam when form changes make its selection invalid", async () => {
        const data: any =
            createData();

        data.info.protocolClassName =
            "XmippProtExtractParticles";

        data.form.sections = [
            {
                label: "Input",
                params: [
                    {
                        paramName:
                            "inputCoordinates",
                        paramDef: {
                            paramClass:
                                "PointerParam",
                            label:
                                "Input coordinates",
                            pointerClass:
                                "SetOfCoordinates",
                        },
                    },
                    {
                        paramName:
                            "ctfRelations",
                        paramDef: {
                            paramClass:
                                "RelationParam",
                            label:
                                "CTF estimation",
                            condition:
                                "inputCoordinates is not None",
                            relationName:
                                "relation_ctf",
                            attributeName:
                                "getInputMicrographs",
                            direction: 0,
                            parentId: 21,
                        },
                    },
                ],
            },
        ];

        data.values = {
            inputCoordinates:
                "12.outputCoordinates",
            ctfRelations:
                "21.outputCTF",
        };

        mockResolveProtocolRelationCandidates
            .mockImplementation(
                async (
                    _projectId: any,
                    payload: any,
                ) => {
                    if (
                        payload
                            .formValues
                            .inputCoordinates ===
                        "12.outputCoordinates"
                    ) {
                        return {
                            paramName:
                                "ctfRelations",
                            relationName:
                                "relation_ctf",
                            values: [
                                "21.outputCTF",
                            ],
                        };
                    }

                    return {
                        paramName:
                            "ctfRelations",
                        relationName:
                            "relation_ctf",
                        values: [
                            "44.outputCTF",
                        ],
                    };
                },
            );

        renderComponent({
            data,
        });

        const relationInput =
            await screen.findByLabelText(
                "CTF estimation"
            );

        expect(
            relationInput
        ).toHaveValue(
            "21.outputCTF"
        );

        await waitFor(
            () => {
                expect(
                    mockResolveProtocolRelationCandidates
                ).toHaveBeenCalled();
            },
        );

        expect(
            relationInput
        ).toHaveValue(
            "21.outputCTF"
        );

        fireEvent.change(
            screen.getByLabelText(
                "Input coordinates"
            ),
            {
                target: {
                    value:
                        "13.outputCoordinates",
                },
            },
        );

        await waitFor(
            () => {
                expect(
                    relationInput
                ).toHaveValue("");
            },
        );

        expect(
            mockResolveProtocolRelationCandidates
        ).toHaveBeenLastCalledWith(
            1,
            {
                protocolClassName:
                    "XmippProtExtractParticles",
                paramName:
                    "ctfRelations",
                formValues:
                    expect.objectContaining({
                        inputCoordinates:
                            "13.outputCoordinates",
                        ctfRelations:
                            "21.outputCTF",
                    }),
            },
        );
    });

    it("keeps a RelationParam when it remains valid after form changes", async () => {
        const data: any =
            createData();

        data.info.protocolClassName =
            "XmippProtExtractParticles";

        data.form.sections = [
            {
                label: "Input",
                params: [
                    {
                        paramName:
                            "inputCoordinates",
                        paramDef: {
                            paramClass:
                                "PointerParam",
                            label:
                                "Input coordinates",
                            pointerClass:
                                "SetOfCoordinates",
                        },
                    },
                    {
                        paramName:
                            "ctfRelations",
                        paramDef: {
                            paramClass:
                                "RelationParam",
                            label:
                                "CTF estimation",
                            condition:
                                "inputCoordinates is not None",
                            relationName:
                                "relation_ctf",
                            attributeName:
                                "getInputMicrographs",
                            direction: 0,
                            parentId: 21,
                        },
                    },
                ],
            },
        ];

        data.values = {
            inputCoordinates:
                "12.outputCoordinates",
            ctfRelations:
                "21.outputCTF",
        };

        mockResolveProtocolRelationCandidates
            .mockResolvedValue({
                paramName:
                    "ctfRelations",
                relationName:
                    "relation_ctf",
                values: [
                    "21.outputCTF",
                    "44.outputCTF",
                ],
            });

        renderComponent({
            data,
        });

        const relationInput =
            await screen.findByLabelText(
                "CTF estimation"
            );

        fireEvent.change(
            screen.getByLabelText(
                "Input coordinates"
            ),
            {
                target: {
                    value:
                        "13.outputCoordinates",
                },
            },
        );

        await waitFor(() => {
            expect(
                mockResolveProtocolRelationCandidates
            ).toHaveBeenCalled();
        });

        expect(
            relationInput
        ).toHaveValue(
            "21.outputCTF"
        );
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


            const externalStatusPill =
                externalDocument.getByTestId(
                    "external-protocol-status-pill",
                );


            expect(
                externalStatusPill
                    .textContent,
            ).toBe(
                "saved",
            );


            expect(
                (
                    externalStatusPill as
                    HTMLElement
                ).style.backgroundColor,
            ).not.toBe(
                "",
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

    it("stores protocol-local queue settings from the use queue wizard", async () => {
        const data: any = createQueueData();

        data.values._queueName = "gpu";
        data.values._queueParams = {
            threads: "12",
        };

        renderQueueComponent({ data });

        fireEvent.click(
            screen.getByRole("button", {
                name: "Use queue wizard",
            }),
        );

        const dialog = await screen.findByRole("dialog");

        expect(
            within(dialog).getByDisplayValue("12"),
        ).toBeInTheDocument();

        fireEvent.change(
            within(dialog).getByDisplayValue("12"),
            {
                target: {
                    value: "16",
                },
            },
        );

        fireEvent.click(
            within(dialog).getByRole("button", {
                name: "Save",
            }),
        );

        await waitFor(() => {
            expect(
                screen.queryByRole("dialog")
            ).not.toBeInTheDocument();
        });

        fireEvent.click(
            screen.getByRole("button", {
                name: "Save",
            }),
        );

        await waitFor(() => {
            expect(mockSaveProtocol).toHaveBeenCalledWith(
                1,
                "7",
                "ProtImportMovies",
                expect.objectContaining({
                    _queueName: "gpu",
                    _queueParams: {
                        threads: "16",
                    },
                }),
            );
        });
    });

    it("reopens the queue wizard with unsaved local queue settings", async () => {
        const data: any = createQueueData();

        data.values._queueName = "gpu";
        data.values._queueParams = {
            threads: "12",
        };

        renderQueueComponent({ data });

        fireEvent.click(
            screen.getByRole("button", {
                name: "Use queue wizard",
            }),
        );

        let dialog = await screen.findByRole("dialog");

        fireEvent.change(
            within(dialog).getByDisplayValue("12"),
            {
                target: {
                    value: "16",
                },
            },
        );

        fireEvent.click(
            within(dialog).getByRole("button", {
                name: "Save",
            }),
        );

        await waitFor(() => {
            expect(
                screen.queryByRole("dialog"),
            ).not.toBeInTheDocument();
        });

        fireEvent.click(
            screen.getByRole("button", {
                name: "Use queue wizard",
            }),
        );

        dialog = await screen.findByRole("dialog");

        expect(
            within(dialog).getByDisplayValue("16"),
        ).toBeInTheDocument();
    });

    it("includes subclass outputs when a PointerParam accepts a base class", async () => {
        const data: any =
            createData();

        data.form.sections = [
            {
                label: "Input",
                params: [
                    {
                        paramName:
                            "inputImages",
                        paramDef: {
                            paramClass:
                                "PointerParam",
                            label:
                                "Input images",
                            pointerClass:
                                "SetOfImages",
                        },
                    },
                ],
            },
        ];

        data.values = {
            inputImages: "",
        };

        const projectProtocols = [
            {
                id: 21,
                label: "Micrographs",
                children: [],
                outputs: [
                    {
                        outputName:
                            "outputMicrographs",
                        pointerClass:
                            "SetOfMicrographs",
                        pointerClassHierarchy: [
                            "SetOfMicrographs",
                            "SetOfMicrographsBase",
                            "SetOfImages",
                            "EMSet",
                        ],
                        value:
                            "ProtImportMovies.outputMicrographs",
                    },
                ],
            },
            {
                id: 44,
                label: "Particles",
                children: [],
                outputs: [
                    {
                        outputName:
                            "outputParticles",
                        pointerClass:
                            "SetOfParticles",
                        pointerClassHierarchy: [
                            "SetOfParticles",
                            "SetOfImages",
                            "EMSet",
                        ],
                        value:
                            "ProtExtractParticles.outputParticles",
                    },
                ],
            },
            {
                id: 55,
                label: "CTF",
                children: [],
                outputs: [
                    {
                        outputName:
                            "outputCTF",
                        pointerClass:
                            "SetOfCTF",
                        pointerClassHierarchy: [
                            "SetOfCTF",
                            "EMSet",
                        ],
                        value:
                            "ProtCTF.outputCTF",
                    },
                ],
            },
        ];

        renderComponent({
            data,
            projectProtocols,
        });

        fireEvent.click(
            screen.getByRole(
                "button",
                {
                    name:
                        "Find Input images",
                },
            ),
        );

        expect(
            await screen.findByText(
                "21.outputMicrographs"
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "44.outputParticles"
            ),
        ).toBeInTheDocument();

        expect(
            screen.queryByText(
                "55.outputCTF"
            ),
        ).not.toBeInTheDocument();
    });



    it(
        "offers compatible protocols as direct PointerParam candidates and saves the protocol id",
        async () => {
            const data: any = createData();

            data.form.sections = [
                {
                    label: "Input",
                    params: [
                        {
                            paramName: "inputProtocol",
                            paramDef: {
                                paramClass: "PointerParam",
                                label: "Input protocol",
                                pointerClass: "ProtProcessParticles",
                            },
                        },
                    ],
                },
            ];

            data.values = {
                inputProtocol: "",
            };

            const projectProtocols = [
                {
                    protocolId: "21",
                    label: "Shift particles",
                    protocolClassName: "XmippProtShiftParticles",
                    protocolClassHierarchy: [
                        "XmippProtShiftParticles",
                        "ProtProcessParticles",
                        "EMProtocol",
                        "Protocol",
                        "Object",
                    ],
                    children: [],
                    outputs: [
                        {
                            outputName: "outputParticles",
                            pointerClass: "SetOfParticles",
                            pointerClassHierarchy: [
                                "SetOfParticles",
                                "SetOfImages",
                                "EMSet",
                                "Object",
                            ],
                            value: "21.outputParticles",
                            parentId: "21",
                        },
                    ],
                },
                {
                    protocolId: "44",
                    label: "Import movies",
                    protocolClassName: "ProtImportMovies",
                    protocolClassHierarchy: [
                        "ProtImportMovies",
                        "EMProtocol",
                        "Protocol",
                        "Object",
                    ],
                    children: [],
                    outputs: [],
                },
            ];

            renderComponent({
                data,
                projectProtocols,
            });

            fireEvent.click(
                screen.getByRole(
                    "button",
                    {
                        name: "Find Input protocol",
                    },
                ),
            );

            const selector =
                await screen.findByTestId(
                    "output-selector-dialog",
                );

            const compatibleProtocol =
                selector.querySelector(
                    '[data-pointer-value="21"]',
                );

            expect(
                compatibleProtocol,
            ).not.toBeNull();

            expect(
                compatibleProtocol,
            ).toHaveAttribute(
                "data-pointer-class",
                "XmippProtShiftParticles",
            );

            expect(
                selector.querySelector(
                    '[data-pointer-value="44"]',
                ),
            ).toBeNull();

            expect(
                selector.querySelector(
                    '[data-pointer-value="21.outputParticles"]',
                ),
            ).toBeNull();

            fireEvent.click(
                compatibleProtocol as Element,
            );

            expect(
                screen.getByLabelText(
                    "Input protocol",
                ),
            ).toHaveValue("21");

            fireEvent.click(
                screen.getByRole(
                    "button",
                    {
                        name: "Save",
                    },
                ),
            );

            await waitFor(() => {
                expect(
                    mockSaveProtocol,
                ).toHaveBeenCalledWith(
                    1,
                    "7",
                    "ProtImportMovies",
                    expect.objectContaining({
                        inputProtocol: "21",
                    }),
                );
            });
        },
    );

    it(
        "offers compatible protocols as direct MultiPointerParam candidates",
        async () => {
            const data: any = createData();

            data.form.sections = [
                {
                    label: "Input",
                    params: [
                        {
                            paramName: "inputProtocols",
                            paramDef: {
                                paramClass: "MultiPointerParam",
                                label: "Input protocols",
                                pointerClass: "ProtProcessParticles",
                            },
                        },
                    ],
                },
            ];

            data.values = {
                inputProtocols: [],
            };

            const projectProtocols = [
                {
                    protocolId: "21",
                    label: "Shift particles",
                    protocolClassName: "XmippProtShiftParticles",
                    protocolClassHierarchy: [
                        "XmippProtShiftParticles",
                        "ProtProcessParticles",
                        "EMProtocol",
                        "Protocol",
                        "Object",
                    ],
                    children: [],
                    outputs: [],
                },
                {
                    protocolId: "44",
                    label: "Import movies",
                    protocolClassName: "ProtImportMovies",
                    protocolClassHierarchy: [
                        "ProtImportMovies",
                        "EMProtocol",
                        "Protocol",
                        "Object",
                    ],
                    children: [],
                    outputs: [],
                },
            ];

            renderComponent({
                data,
                projectProtocols,
            });

            const findIcon =
                screen.getByTestId(
                    "find-icon",
                );

            fireEvent.click(
                findIcon.closest("button") as Element,
            );

            const selector =
                await screen.findByTestId(
                    "output-selector-dialog",
                );

            const compatibleProtocol =
                selector.querySelector(
                    '[data-pointer-value="21"]',
                );

            expect(
                compatibleProtocol,
            ).not.toBeNull();

            expect(
                selector.querySelector(
                    '[data-pointer-value="44"]',
                ),
            ).toBeNull();

            fireEvent.click(
                compatibleProtocol as Element,
            );

            expect(
                await screen.findByDisplayValue(
                    "21",
                ),
            ).toBeInTheDocument();

            fireEvent.click(
                screen.getByRole(
                    "button",
                    {
                        name: "Save",
                    },
                ),
            );

            await waitFor(() => {
                expect(
                    mockSaveProtocol,
                ).toHaveBeenCalledWith(
                    1,
                    "7",
                    "ProtImportMovies",
                    expect.objectContaining({
                        inputProtocols: ["21"],
                    }),
                );
            });
        },
    );


    it(
        "keeps label as the protocol form header when runName differs",
        () => {
            const data: any = createData();

            data.info.protocolName = "pwem - import movies";
            data.info.runName = "pwem - import movies (copy)";

            renderComponent({
                data,
            });

            expect(
                screen.getByText(
                    "pwem - import movies",
                ),
            ).toBeInTheDocument();

            expect(
                screen.queryByText(
                    "pwem - import movies (copy)",
                ),
            ).not.toBeInTheDocument();
        },
    );

});


// RED 51: ScipionAPI exposes two *different* ancestries on persisted Sets.
// ProtocolForm must forward both to the selector, rather than filtering the
// Set out because its pointerClass does not match the *item* class.
describe("ProtocolForm nested pointer candidates (RED 51)", () => {
    const volumeHierarchy = [
        "Volume",
        "EMObject",
        "Object",
    ];
    const setHierarchy = [
        "SetOfVolumes",
        "EMSet",
        "Set",
        "EMObject",
        "Object",
    ];

    function fixture(expectedClass: string) {
        const data: any = createData();
        data.form.sections = [{
            label: "Input",
            params: [{
                paramName: "inputObject",
                paramDef: {
                    paramClass: "PointerParam",
                    label: "Input object",
                    pointerClass: expectedClass,
                },
            }],
        }];
        data.values = { inputObject: "" };

        const projectProtocols: any[] = [
            {
                id: 21,
                label: "Single volume producer",
                children: [],
                outputs: [{
                    outputName: "outputVolume",
                    pointerClass: "Volume",
                    pointerClassHierarchy: volumeHierarchy,
                    value: "21.outputVolume",
                }],
            },
            {
                id: 22,
                label: "Set of volumes producer",
                children: [],
                outputs: [{
                    outputName: "outputVolumes",
                    pointerClass: "SetOfVolumes",
                    pointerClassHierarchy: setHierarchy,
                    itemClassName: "Volume",
                    itemClassHierarchy: volumeHierarchy,
                    value: "22.outputVolumes",
                }],
            },
            {
                id: 23,
                label: "Legacy set metadata producer",
                children: [],
                outputs: [{
                    outputName: "outputLegacyVolumes",
                    pointerClass: "SetOfVolumes",
                    pointerClassHierarchy: setHierarchy,
                    itemClassName: "Volume",
                    value: "23.outputLegacyVolumes",
                }],
            },
            {
                id: 33,
                label: "Set of particles producer",
                children: [],
                outputs: [{
                    outputName: "outputParticles",
                    pointerClass: "SetOfParticles",
                    pointerClassHierarchy: ["SetOfParticles", "SetOfImages", "EMSet", "Set"],
                    itemClassName: "Particle",
                    itemClassHierarchy: ["Particle", "Image", "EMObject", "Object"],
                    value: "33.outputParticles",
                }],
            },
            {
                id: 7,
                label: "Current protocol",
                children: [88],
                outputs: [{
                    outputName: "outputOwnVolumes",
                    pointerClass: "SetOfVolumes",
                    pointerClassHierarchy: setHierarchy,
                    itemClassName: "Volume",
                    itemClassHierarchy: volumeHierarchy,
                    value: "7.outputOwnVolumes",
                }],
            },
            {
                id: 88,
                label: "Downstream protocol",
                children: [],
                outputs: [{
                    outputName: "outputChildVolumes",
                    pointerClass: "SetOfVolumes",
                    pointerClassHierarchy: setHierarchy,
                    itemClassName: "Volume",
                    itemClassHierarchy: volumeHierarchy,
                    value: "88.outputChildVolumes",
                }],
            },
        ];
        return { data, projectProtocols };
    }

    async function openSelector(expectedClass: string) {
        renderComponent(fixture(expectedClass));
        fireEvent.click(screen.getByRole("button", { name: "Find Input object" }));
        return screen.findByTestId("output-selector-dialog");
    }

    it("keeps directly compatible Volume outputs as candidates (baseline)", async () => {
        const selector = await openSelector("Volume");
        expect(
            selector.querySelector('[data-pointer-value="21.outputVolume"]'),
        ).not.toBeNull();
    });

    it("retains an item-compatible SetOfVolumes as a browsable candidate", async () => {
        const selector = await openSelector("Volume");
        expect(
            selector.querySelector('[data-pointer-value="22.outputVolumes"]'),
        ).not.toBeNull();
    });

    it("preserves the exact item class and hierarchy on the set candidate", async () => {
        const selector = await openSelector("Volume");
        const row = selector.querySelector('[data-pointer-value="22.outputVolumes"]');
        expect(row).not.toBeNull();
        expect(row).toHaveAttribute("data-item-class", "Volume");
        expect(row).toHaveAttribute(
            "data-item-hierarchy",
            JSON.stringify(volumeHierarchy),
        );
        expect(row).toHaveAttribute("data-pointer-class", "SetOfVolumes");
    });

    it("accepts itemClassName even when legacy output lacks itemClassHierarchy", async () => {
        const selector = await openSelector("Volume");
        expect(
            selector.querySelector('[data-pointer-value="23.outputLegacyVolumes"]'),
        ).not.toBeNull();
    });

    it("uses item inheritance for other types without hardcoding Volume", async () => {
        const selector = await openSelector("Image");
        const row = selector.querySelector('[data-pointer-value="33.outputParticles"]');
        expect(row).not.toBeNull();
        expect(row).toHaveAttribute("data-item-class", "Particle");
    });

    it("excludes sets whose members are incompatible with the requested class", async () => {
        const selector = await openSelector("Volume");
        expect(
            selector.querySelector('[data-pointer-value="33.outputParticles"]'),
        ).toBeNull();
    });

    it("still blocks the current protocol and descendants from selection", async () => {
        const selector = await openSelector("Volume");
        expect(
            selector.querySelector('[data-pointer-value="7.outputOwnVolumes"]'),
        ).toBeNull();
        expect(
            selector.querySelector('[data-pointer-value="88.outputChildVolumes"]'),
        ).toBeNull();
    });
});


// RED 59: this is the consumer wiring test. The actual OutputSelectorDialog
// handles expansion/pagination (RED 49); here we prove ProtocolForm supplies
// an authenticated ProjectService-backed loader for exactly the producer Set.
// The server returns only discovery metadata: no fabricated Pointer.value.
describe("ProtocolForm generic Set item loader (RED 59)", () => {
    // GREEN 61: RED 59 is a separate top-level describe. The existing
    // ProtocolForm beforeEach does not apply to these six tests.
    // Isolate both call history AND implementations between test cases.
    beforeEach(() => {
        mockOutputSelectorRender.mockClear();
        mockListPointerSelectableSetItemsPage.mockReset();
    });

    const volumeHierarchy = ["Volume", "EMObject", "Object"];
    const volumeSetHierarchy = ["SetOfVolumes", "EMSet", "Set", "Object"];

    const setPage = {
        items: [
            {
                scipionItemId: 34,
                name: "Refined volume 34",
                enabled: true,
                itemClassName: "Volume",
            },
        ],
        nextCursor: "34",
    };
    const lastPage = {
        items: [
            {
                scipionItemId: 91,
                name: "Refined volume 91",
                enabled: false,
                itemClassName: "Volume",
            },
        ],
        nextCursor: null,
    };

    function openForVolume() {
        const data: any = createData();
        data.form.sections = [{
            label: "Inputs",
            params: [{
                paramName: "inputObject",
                paramDef: {
                    paramClass: "PointerParam",
                    label: "Input object",
                    pointerClass: "Volume",
                },
            }],
        }];
        data.values = { inputObject: "" };

        // protocolId is the Scipion runtime ID. `id` is a distinct internal
        // identity, and must never be used in the /pointer-items URL.
        const projectProtocols: any[] = [
            {
                id: 102,
                protocolId: "2202",
                label: "Volume container",
                children: [],
                outputs: [{
                    outputName: "outputVolumes",
                    value: "2202.outputVolumes",
                    pointerClass: "SetOfVolumes",
                    pointerClassHierarchy: volumeSetHierarchy,
                    itemClassName: "Volume",
                    itemClassHierarchy: volumeHierarchy,
                }],
            },
            {
                id: 103,
                protocolId: "2101",
                label: "Single volume",
                children: [],
                outputs: [{
                    outputName: "outputVolume",
                    value: "2101.outputVolume",
                    pointerClass: "Volume",
                    pointerClassHierarchy: volumeHierarchy,
                }],
            },
        ];

        renderComponent({ data, projectProtocols });
        fireEvent.click(screen.getByRole("button", { name: "Find Input object" }));

        const openCalls = mockOutputSelectorRender.mock.calls
            .map(([props]: any[]) => props)
            .filter((props: any) => props.open === true);
        expect(openCalls.length).toBeGreaterThan(0);
        const props = openCalls[openCalls.length - 1];
        const setOutput = props.allOutputs.find(
            (output: any) => output.key === "outputVolumes",
        );
        return { props, setOutput };
    }

    it("retains the directly assignable Volume and SetOfVolumes without fetching (baseline)", () => {
        const { props, setOutput } = openForVolume();

        expect(setOutput).toMatchObject({
            key: "outputVolumes",
            protocolId: "2202",
            itemClassName: "Volume",
        });
        expect(props.allOutputs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ key: "outputVolume", pointerClass: "Volume" }),
            ]),
        );
        expect(mockListPointerSelectableSetItemsPage).not.toHaveBeenCalled();
    });

    it("provides the generic loader to the open selector when the service supports it", () => {
        const { props } = openForVolume();
        expect(typeof props.loadSetItems).toBe("function");
        expect(mockListPointerSelectableSetItemsPage).not.toHaveBeenCalled();
    });

    it("passes Scipion producer ID, project ID and output name to the service", async () => {
        mockListPointerSelectableSetItemsPage.mockResolvedValue(setPage);
        const { props, setOutput } = openForVolume();

        const result = await props.loadSetItems(setOutput, { cursor: null, limit: 50 });

        expect(mockListPointerSelectableSetItemsPage).toHaveBeenCalledExactlyOnceWith(
            1, "2202", "outputVolumes", { cursor: null, limit: 50, includePointerValues: true },
        );
        expect(result).toEqual(setPage);
    });

    it("forwards subsequent cursors, never replacing them with offsets", async () => {
        mockListPointerSelectableSetItemsPage.mockImplementation(
            async (_projectId: unknown, _protocolId: unknown, _name: unknown, options: any) =>
                options.cursor === null ? setPage : lastPage,
        );
        const { props, setOutput } = openForVolume();
        const first = await props.loadSetItems(setOutput, { cursor: null, limit: 50 });
        const second = await props.loadSetItems(setOutput, {
            cursor: first.nextCursor,
            limit: 50,
        });

        expect(second).toEqual(lastPage);
        expect(mockListPointerSelectableSetItemsPage).toHaveBeenNthCalledWith(
            2, 1, "2202", "outputVolumes", { cursor: "34", limit: 50, includePointerValues: true },
        );
    });

    it("preserves backend failures for the selector to show and retry", async () => {
        mockListPointerSelectableSetItemsPage.mockRejectedValue(
            new Error("Project access denied"),
        );
        const { props, setOutput } = openForVolume();

        await expect(
            props.loadSetItems(setOutput, { cursor: null, limit: 50 }),
        ).rejects.toThrow("Project access denied");
        expect(mockListPointerSelectableSetItemsPage).toHaveBeenCalledTimes(1);
    });

    it("RED 72: preserves directly compatible candidates and lazy loading (baseline)", () => {
        const { props, setOutput } = openForVolume();
        expect(setOutput).toMatchObject({ key: "outputVolumes", itemClassName: "Volume" });
        expect(props.allOutputs).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: "outputVolume", pointerClass: "Volume" }),
        ]));
        expect(mockListPointerSelectableSetItemsPage).not.toHaveBeenCalled();
    });

    it("RED 72: requests native member values on the first page", async () => {
        mockListPointerSelectableSetItemsPage.mockResolvedValue(setPage);
        const { props, setOutput } = openForVolume();
        const result = await props.loadSetItems(setOutput, { cursor: null, limit: 50 });

        expect(result).toBe(setPage);
        expect(mockListPointerSelectableSetItemsPage).toHaveBeenCalledWith(
            1, "2202", "outputVolumes",
            { cursor: null, limit: 50, includePointerValues: true },
        );
    });

    it("RED 72: preserves cursor and requests native values on subsequent pages", async () => {
        mockListPointerSelectableSetItemsPage.mockResolvedValue(lastPage);
        const { props, setOutput } = openForVolume();
        const result = await props.loadSetItems(setOutput, { cursor: "34", limit: 25 });

        expect(result).toBe(lastPage);
        expect(mockListPointerSelectableSetItemsPage).toHaveBeenCalledWith(
            1, "2202", "outputVolumes",
            { cursor: "34", limit: 25, includePointerValues: true },
        );
    });

    it("returns exact metadata without inventing executable item pointers", async () => {
        mockListPointerSelectableSetItemsPage.mockResolvedValue(setPage);
        const { props, setOutput } = openForVolume();
        const result = await props.loadSetItems(setOutput, { cursor: null, limit: 50 });

        expect(result).toBe(setPage);
        expect(result.items[0]).toEqual({
            scipionItemId: 34,
            name: "Refined volume 34",
            enabled: true,
            itemClassName: "Volume",
        });
        expect(result.items[0]).not.toHaveProperty("value");
        expect(result.items[0]).not.toHaveProperty("pointerClass");
        expect(screen.getByLabelText("Input object")).toHaveValue("");
    });
});


describe("RED 129: protocol and output analysis remain separate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetchProtocolViewerCandidates.mockResolvedValue({
            projectId: 1, protocolId: "7", viewers: [],
        });
    });

    it("shows a protocol-level Analyze results action even with zero outputs", async () => {
        renderComponent();
        const button = screen.getByRole("button", { name: "Analyze results" });
        expect(button).toBeEnabled();
        expect(mockFetchProtocolViewerCandidates).not.toHaveBeenCalled();
        fireEvent.click(button);
        await waitFor(() => {
            expect(mockFetchProtocolViewerCandidates).toHaveBeenCalledWith("1", "7");
        });
        expect(await screen.findByText("No protocol viewers registered for this protocol.")).toBeInTheDocument();
    });

    it("displays the registered protocol viewers without enabling execution", async () => {
        mockFetchProtocolViewerCandidates.mockResolvedValue({
            viewers: [{ id: "relion.viewer.RelionViewer", name: "RelionViewer",
                webLaunchAllowed: false, contractValidation: { status: "described" } }],
        });
        renderComponent();
        fireEvent.click(screen.getByRole("button", { name: "Analyze results" }));
        const dialog = await screen.findByRole("dialog", { name: "Analyze protocol results" });
        expect(within(dialog).getByText("RelionViewer")).toBeInTheDocument();
        expect(within(dialog).getByText("Web integration pending")).toBeInTheDocument();
        expect(within(dialog).queryByRole("button", { name: /launch|run|execute/i })).not.toBeInTheDocument();
    });

    it("reports a viewer discovery failure without falling back to an output", async () => {
        mockFetchProtocolViewerCandidates.mockRejectedValue(new Error("Backend unavailable"));
        renderComponent();
        fireEvent.click(screen.getByRole("button", { name: "Analyze results" }));
        expect(await screen.findByText("Could not load protocol viewers.")).toBeInTheDocument();
        expect(screen.queryByTestId("analyze-output-dialog")).not.toBeInTheDocument();
    });

    it("disables protocol analysis for a protocol without a persisted id", () => {
        const data: any = createData();
        data.info.protocolId = null;
        delete data.info.id;
        renderComponent({ data });
        expect(screen.getByRole("button", { name: "Analyze results" })).toBeDisabled();
        expect(mockFetchProtocolViewerCandidates).not.toHaveBeenCalled();
    });

    it("offers the same protocol action in the floating presentation", () => {
        renderComponent({ variant: "floating" });
        expect(screen.getByRole("button", { name: "Analyze results" })).toBeEnabled();
    });
});
