import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import {
    fireEvent,
    screen,
    waitFor,
} from "@testing-library/react";

import ImportWorkflowDialog from "../../projects/ImportWorkflowDialog";
import {
    createProjectServiceMock,
    renderWithProviders,
} from "../test-utils";
import toast from "react-hot-toast";


const remoteDialogState = vi.hoisted(() => ({
    props: null as any,
}));


vi.mock("react-hot-toast", () => ({
    default: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));


vi.mock("@/components/files/RemoteFileDialog", () => ({
    __esModule: true,

    default: (props: any) => {
        remoteDialogState.props = props;

        if (!props.open) {
            return null;
        }

        return (
            <div data-testid="mock-remote-file-dialog">
                <button
                    type="button"
                    data-testid="mock-pick-workflow"
                    onClick={() =>
                        props.onPick(
                            "workflows/demo.json",
                            {
                                name: "demo.json",
                                path: "workflows/demo.json",
                                isDir: false,
                            },
                        )
                    }
                >
                    Pick workflow
                </button>

                <button
                    type="button"
                    onClick={props.onClose}
                >
                    Close browser
                </button>
            </div>
        );
    },
}));


function makeValidInspection() {
    return {
        path: "workflows/demo.json",
        fileName: "demo.json",
        scipionWebWrapped: true,
        protocolsCount: 3,
        requiredPluginNames: [
            "xmipp3",
            "relion",
        ],
        missingPluginNames: [],
        canLoad: true,
        disabledReason: "",
    };
}


describe("ImportWorkflowDialog", () => {
    const onClose = vi.fn();
    const onImported = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        remoteDialogState.props = null;
    });


    it("selects and validates a workflow JSON file", async () => {
        const inspectWorkflowFile = vi.fn()
            .mockResolvedValue(
                makeValidInspection(),
            );

        const service = createProjectServiceMock({
            fetchList: vi.fn().mockResolvedValue([]),
            inspectWorkflowFile,
        });

        renderWithProviders(
            <ImportWorkflowDialog
                open={true}
                onClose={onClose}
                onImported={onImported}
            />,
            { service },
        );

        expect(
            screen.getByText("Import workflow"),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole(
                "button",
                {
                    name: "Browse workflow file",
                },
            ),
        );

        expect(
            await screen.findByTestId(
                "mock-remote-file-dialog",
            ),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByTestId(
                "mock-pick-workflow",
            ),
        );

        await waitFor(() => {
            expect(
                inspectWorkflowFile,
            ).toHaveBeenCalledWith(
                "workflows/demo.json",
            );
        });

        expect(
            screen.getByText("demo.json"),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                /Protocols:\s*3/i,
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                /xmipp3,\s*relion/i,
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByRole(
                "button",
                { name: "Import" },
            ),
        ).toBeEnabled();
    });


    it("keeps import disabled when required plugins are missing", async () => {
        const inspectWorkflowFile = vi.fn()
            .mockResolvedValue({
                ...makeValidInspection(),
                missingPluginNames: [
                    "relion",
                ],
                canLoad: false,
                disabledReason:
                    "Missing required plugins: relion",
            });

        const importWorkflowFile = vi.fn();

        const service = createProjectServiceMock({
            fetchList: vi.fn().mockResolvedValue([]),
            inspectWorkflowFile,
            importWorkflowFile,
        });

        renderWithProviders(
            <ImportWorkflowDialog
                open={true}
                onClose={onClose}
                onImported={onImported}
            />,
            { service },
        );

        fireEvent.click(
            screen.getByRole(
                "button",
                {
                    name: "Browse workflow file",
                },
            ),
        );

        fireEvent.click(
            await screen.findByTestId(
                "mock-pick-workflow",
            ),
        );

        expect(
            await screen.findByText(
                /Missing plugins:\s*relion/i,
            ),
        ).toBeInTheDocument();

        const importButton =
            screen.getByRole(
                "button",
                { name: "Import" },
            );

        expect(
            importButton,
        ).toBeDisabled();

        fireEvent.click(importButton);

        expect(
            importWorkflowFile,
        ).not.toHaveBeenCalled();
    });


    it("creates a project and imports the workflow into it", async () => {
        const inspectWorkflowFile = vi.fn()
            .mockResolvedValue(
                makeValidInspection(),
            );

        const createProject = vi.fn()
            .mockResolvedValue({
                id: 77,
                name: "demo",
            });

        const importWorkflowFile = vi.fn()
            .mockResolvedValue({
                status: 0,
                errors: [],
                protocolsCount: 3,
                dependenciesCount: 2,
                fileName: "demo.json",
                requiredPluginNames: [
                    "xmipp3",
                    "relion",
                ],
            });

        const service = createProjectServiceMock({
            fetchList: vi.fn().mockResolvedValue([]),
            inspectWorkflowFile,
            createProject,
            importWorkflowFile,
        });

        renderWithProviders(
            <ImportWorkflowDialog
                open={true}
                onClose={onClose}
                onImported={onImported}
            />,
            { service },
        );

        fireEvent.click(
            screen.getByRole(
                "button",
                {
                    name: "Browse workflow file",
                },
            ),
        );

        fireEvent.click(
            await screen.findByTestId(
                "mock-pick-workflow",
            ),
        );

        await screen.findByText(
            "demo.json",
        );

        expect(
            screen.getByDisplayValue(
                "demo",
            ),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole(
                "button",
                { name: "Import" },
            ),
        );

        await waitFor(() => {
            expect(
                createProject,
            ).toHaveBeenCalledWith({
                name: "demo",
                description: undefined,
            });
        });

        expect(
            importWorkflowFile,
        ).toHaveBeenCalledWith(
            77,
            "workflows/demo.json",
        );

        expect(
            onImported,
        ).toHaveBeenCalledTimes(1);

        expect(
            onClose,
        ).toHaveBeenCalledTimes(1);

        expect(
            toast.success,
        ).toHaveBeenCalled();

        expect(
            toast.error,
        ).not.toHaveBeenCalled();
    });


    it("imports the workflow into an existing project without creating another one", async () => {
        const inspectWorkflowFile = vi.fn()
            .mockResolvedValue(
                makeValidInspection(),
            );

        const createProject = vi.fn();

        const importWorkflowFile = vi.fn()
            .mockResolvedValue({
                status: 0,
                errors: [],
                protocolsCount: 3,
            });

        const service = createProjectServiceMock({
            fetchList: vi.fn().mockResolvedValue([
                {
                    id: 12,
                    name: "Existing Project",
                },
            ]),
            inspectWorkflowFile,
            createProject,
            importWorkflowFile,
        });

        renderWithProviders(
            <ImportWorkflowDialog
                open={true}
                onClose={onClose}
                onImported={onImported}
            />,
            { service },
        );

        fireEvent.click(
            screen.getByRole(
                "button",
                {
                    name: "Browse workflow file",
                },
            ),
        );

        fireEvent.click(
            await screen.findByTestId(
                "mock-pick-workflow",
            ),
        );

        await screen.findByText(
            "demo.json",
        );

        fireEvent.click(
            screen.getByRole(
                "button",
                {
                    name: "Existing project",
                },
            ),
        );

        const select =
            screen.getByRole(
                "combobox",
            );

        fireEvent.mouseDown(select);

        fireEvent.click(
            await screen.findByRole(
                "option",
                {
                    name: "Existing Project",
                },
            ),
        );

        fireEvent.click(
            screen.getByRole(
                "button",
                { name: "Import" },
            ),
        );

        await waitFor(() => {
            expect(
                importWorkflowFile,
            ).toHaveBeenCalledWith(
                "12",
                "workflows/demo.json",
            );
        });

        expect(
            createProject,
        ).not.toHaveBeenCalled();

        expect(
            onImported,
        ).toHaveBeenCalledTimes(1);

        expect(
            onClose,
        ).toHaveBeenCalledTimes(1);
    });


    it("shows the inspection error and does not allow import", async () => {
        const inspectWorkflowFile = vi.fn()
            .mockRejectedValue(
                new Error(
                    "Invalid workflow JSON",
                ),
            );

        const importWorkflowFile = vi.fn();

        const service = createProjectServiceMock({
            fetchList: vi.fn().mockResolvedValue([]),
            inspectWorkflowFile,
            importWorkflowFile,
        });

        renderWithProviders(
            <ImportWorkflowDialog
                open={true}
                onClose={onClose}
                onImported={onImported}
            />,
            { service },
        );

        fireEvent.click(
            screen.getByRole(
                "button",
                {
                    name: "Browse workflow file",
                },
            ),
        );

        fireEvent.click(
            await screen.findByTestId(
                "mock-pick-workflow",
            ),
        );

        expect(
            await screen.findByText(
                "Invalid workflow JSON",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByRole(
                "button",
                { name: "Import" },
            ),
        ).toBeDisabled();

        expect(
            importWorkflowFile,
        ).not.toHaveBeenCalled();
    });


    it("shows only directories and workflow files in the remote browser", async () => {
        const listRemoteDirectory = vi.fn()
            .mockResolvedValue([
                {
                    name: "workflows",
                    path: "workflows",
                    isDir: true,
                },
                {
                    name: "valid.json",
                    path: "valid.json",
                    isDir: false,
                },
                {
                    name: "workflow.template",
                    path: "workflow.template",
                    isDir: false,
                },
                {
                    name: "notes.txt",
                    path: "notes.txt",
                    isDir: false,
                },
                {
                    name: "image.mrc",
                    path: "image.mrc",
                    isDir: false,
                },
            ]);

        const service = createProjectServiceMock({
            fetchList: vi.fn().mockResolvedValue([]),
            listRemoteDirectory,
        });

        renderWithProviders(
            <ImportWorkflowDialog
                open={true}
                onClose={onClose}
                onImported={onImported}
            />,
            { service },
        );

        fireEvent.click(
            screen.getByRole(
                "button",
                {
                    name: "Browse workflow file",
                },
            ),
        );

        await screen.findByTestId(
            "mock-remote-file-dialog",
        );

        const result =
            await remoteDialogState.props
                .listRemoteDirectory("");

        expect(
            listRemoteDirectory,
        ).toHaveBeenCalledWith(
            -1,
            -1,
            "",
        );

        expect(result).toEqual([
            {
                name: "workflows",
                path: "workflows",
                isDir: true,
            },
            {
                name: "valid.json",
                path: "valid.json",
                isDir: false,
            },
        ]);
    });
});