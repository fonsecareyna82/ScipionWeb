import { useCallback, useEffect, useState } from "react";
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    IconButton,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
    alpha,
    useTheme,
} from "@mui/material";
import {
    AlertTriangle,
    CheckCircle2,
    FileJson,
    FolderOpen,
    X,
} from "lucide-react";
import toast from "react-hot-toast";

import { useProjectService } from "@/ProjectServiceContext";
import RemoteFileDialog, {
    type RemoteEntry,
} from "@/components/files/RemoteFileDialog";
import type {
    WorkflowFileInspection,
} from "@/services/ProjectService";

type ImportWorkflowMode = "create" | "select";

type ImportWorkflowDialogProps = {
    open: boolean;
    onClose: () => void;
    onImported?: () => Promise<void> | void;
};

function extractErrorMessage(error: unknown): string {
    if (typeof error === "string" && error.trim()) {
        return error.trim();
    }

    if (error instanceof Error && error.message.trim()) {
        return error.message.trim();
    }

    if (error && typeof error === "object") {
        const value = error as Record<string, unknown>;

        if (
            typeof value.detail === "string" &&
            value.detail.trim()
        ) {
            return value.detail.trim();
        }

        if (
            typeof value.message === "string" &&
            value.message.trim()
        ) {
            return value.message.trim();
        }
    }

    return "Failed to import workflow";
}

export default function ImportWorkflowDialog({
    open,
    onClose,
    onImported,
}: ImportWorkflowDialogProps) {
    const theme = useTheme();
    const svc = useProjectService();

    const [browserOpen, setBrowserOpen] = useState(false);
    const [browserKey, setBrowserKey] = useState(0);

    const [workflowPath, setWorkflowPath] = useState("");
    const [inspection, setInspection] =
        useState<WorkflowFileInspection | null>(null);
    const [inspectionError, setInspectionError] =
        useState<string | null>(null);
    const [inspecting, setInspecting] = useState(false);

    const [mode, setMode] =
        useState<ImportWorkflowMode>("create");

    const [newProjectTitle, setNewProjectTitle] =
        useState("");
    const [newProjectDescription, setNewProjectDescription] =
        useState("");

    const [projectOptions, setProjectOptions] = useState<
        Array<{
            id: string;
            name: string;
        }>
    >([]);

    const [selectedProjectId, setSelectedProjectId] =
        useState("");

    const [projectsLoading, setProjectsLoading] =
        useState(false);
    const [projectsError, setProjectsError] =
        useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;

        setBrowserOpen(false);
        setWorkflowPath("");
        setInspection(null);
        setInspectionError(null);
        setInspecting(false);

        setMode("create");
        setNewProjectTitle("");
        setNewProjectDescription("");

        setSelectedProjectId("");
        setSubmitting(false);
    }, [open]);

    useEffect(() => {
        if (!open) return;

        let cancelled = false;

        const loadProjects = async () => {
            setProjectsLoading(true);
            setProjectsError(null);

            try {
                const data = await svc.fetchList();

                const normalized = Array.isArray(data)
                    ? data.map((project: any) => ({
                        id: String(
                            project.id ??
                            project.projectId ??
                            project.name,
                        ),
                        name: String(
                            project.name ??
                            project.shortName ??
                            project.id ??
                            "",
                        ),
                    }))
                    : [];

                if (!cancelled) {
                    setProjectOptions(normalized);
                }
            } catch (error: unknown) {
                if (!cancelled) {
                    setProjectsError(
                        extractErrorMessage(error),
                    );
                    setProjectOptions([]);
                }
            } finally {
                if (!cancelled) {
                    setProjectsLoading(false);
                }
            }
        };

        void loadProjects();

        return () => {
            cancelled = true;
        };
    }, [open, svc]);

    const inspectFile = useCallback(
        async (path: string) => {
            setWorkflowPath(path);
            setInspection(null);
            setInspectionError(null);
            setInspecting(true);

            try {
                const result =
                    await svc.inspectWorkflowFile(path);

                setInspection(result);

                const suggestedProjectName =
                    result.fileName
                        ?.replace(/\.(json|template)$/i, "")
                        .trim() || "Imported workflow";

                setNewProjectTitle(
                    suggestedProjectName,
                );
            } catch (error: unknown) {
                setInspectionError(
                    extractErrorMessage(error),
                );
            } finally {
                setInspecting(false);
            }
        },
        [svc],
    );

    const listWorkflowDirectory = useCallback(
        async (path: string): Promise<RemoteEntry[]> => {
            const entries =
                await svc.listRemoteDirectory(
                    -1,
                    -1,
                    path,
                );

            if (!Array.isArray(entries)) {
                return [];
            }

            return entries.filter(
                (entry) => {
                    if (entry.isDir) {
                        return true;
                    }

                    const fileName =
                        entry.name.toLowerCase();

                    return (
                        fileName.endsWith(".json") ||
                        fileName.endsWith(".template")
                    );
                },
            );
        },
        [svc],
    );

    const handleImport = async () => {
        if (
            !inspection ||
            !inspection.canLoad ||
            !workflowPath
        ) {
            return;
        }

        setSubmitting(true);

        try {
            let targetProjectId:
                | string
                | number
                | undefined;

            let targetProjectName:
                | string
                | undefined;

            if (mode === "create") {
                const createdProject: any =
                    await svc.createProject({
                        name: newProjectTitle.trim(),
                        description:
                            newProjectDescription.trim() ||
                            undefined,
                    });

                targetProjectId =
                    createdProject?.id ??
                    createdProject?.projectId ??
                    createdProject?.project?.id ??
                    createdProject?.data?.id;

                targetProjectName =
                    createdProject?.name ??
                    createdProject?.project?.name ??
                    newProjectTitle.trim();

                if (!targetProjectId) {
                    throw new Error(
                        "Project id not returned by backend.",
                    );
                }
            } else {
                if (!selectedProjectId) {
                    throw new Error(
                        "No project selected.",
                    );
                }

                targetProjectId =
                    selectedProjectId;

                targetProjectName =
                    projectOptions.find(
                        (project) =>
                            project.id ===
                            selectedProjectId,
                    )?.name ??
                    selectedProjectId;
            }

            const result =
                await svc.importWorkflowFile(
                    targetProjectId,
                    workflowPath,
                );

            if (
                Array.isArray(result.errors) &&
                result.errors.length > 0
            ) {
                throw new Error(
                    result.errors.join("\n"),
                );
            }

            toast.success(
                `Workflow "${inspection.fileName}" imported into "${targetProjectName}".`,
            );

            await onImported?.();

            onClose();
        } catch (error: unknown) {
            toast.error(
                extractErrorMessage(error),
            );
        } finally {
            setSubmitting(false);
        }
    };

    const importDisabled =
        submitting ||
        inspecting ||
        !inspection ||
        !inspection.canLoad ||
        (mode === "create"
            ? !newProjectTitle.trim()
            : !selectedProjectId ||
            projectsLoading ||
            !!projectsError);

    return (
        <>
            <Dialog
                open={open}
                onClose={
                    submitting || browserOpen
                        ? undefined
                        : onClose
                }
                maxWidth="sm"
                fullWidth
                disableEnforceFocus
                disableAutoFocus
                disableRestoreFocus
                PaperProps={{
                    sx: {
                        borderRadius: 4,
                        overflow: "hidden",
                        border: `1px solid ${alpha(
                            theme.palette.divider,
                            0.9,
                        )}`,
                    },
                }}
            >
                <DialogTitle
                    sx={{
                        px: 2.5,
                        py: 1.5,
                        backgroundColor: "#333d49",
                        borderBottom:
                            "1px solid rgba(255,255,255,0.08)",
                    }}
                >
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                    >
                        <Typography
                            variant="subtitle1"
                            sx={{
                                color: "#fff",
                                fontWeight: 700,
                            }}
                        >
                            Import workflow
                        </Typography>

                        <IconButton
                            onClick={onClose}
                            size="small"
                            disabled={submitting}
                            sx={{
                                color: "#fff",
                            }}
                        >
                            <X size={16} />
                        </IconButton>
                    </Stack>
                </DialogTitle>

                <DialogContent
                    sx={{
                        px: 2.5,
                        py: 2.5,
                    }}
                >
                    <Stack spacing={2.5}>
                        <Box>
                            <Typography
                                variant="body2"
                                sx={{
                                    mb: 0.75,
                                    fontWeight: 600,
                                }}
                            >
                                Workflow file
                            </Typography>

                            <Stack
                                direction="row"
                                spacing={1}
                            >
                                <TextField
                                    fullWidth
                                    size="small"
                                    value={workflowPath}
                                    placeholder="Select a .json or .template workflow"
                                    InputProps={{
                                        readOnly: true,
                                    }}
                                />

                                <IconButton
                                    aria-label="Browse workflow file"
                                    onClick={() => {
                                        setBrowserKey(
                                            (value) => value + 1,
                                        );
                                        setBrowserOpen(true);
                                    }}
                                    disabled={
                                        submitting ||
                                        inspecting
                                    }
                                    sx={{
                                        border: `1px solid ${alpha(
                                            theme.palette.text.primary,
                                            0.16,
                                        )}`,
                                        borderRadius: 1,
                                    }}
                                >
                                    <FolderOpen size={18} />
                                </IconButton>
                            </Stack>
                        </Box>

                        {inspecting && (
                            <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                            >
                                <CircularProgress size={18} />
                                <Typography variant="body2">
                                    Validating workflow…
                                </Typography>
                            </Stack>
                        )}

                        {inspectionError && (
                            <Box
                                sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    border:
                                        "1px solid rgba(239,68,68,0.30)",
                                    backgroundColor:
                                        "rgba(239,68,68,0.06)",
                                }}
                            >
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="flex-start"
                                >
                                    <AlertTriangle
                                        size={18}
                                    />
                                    <Typography
                                        variant="body2"
                                    >
                                        {inspectionError}
                                    </Typography>
                                </Stack>
                            </Box>
                        )}

                        {inspection && (
                            <Box
                                sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    border: `1px solid ${inspection.canLoad
                                        ? "rgba(34,197,94,0.30)"
                                        : "rgba(245,158,11,0.35)"
                                        }`,
                                    backgroundColor:
                                        inspection.canLoad
                                            ? "rgba(34,197,94,0.05)"
                                            : "rgba(245,158,11,0.06)",
                                }}
                            >
                                <Stack spacing={1}>
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems="center"
                                    >
                                        {inspection.canLoad ? (
                                            <CheckCircle2
                                                size={18}
                                            />
                                        ) : (
                                            <AlertTriangle
                                                size={18}
                                            />
                                        )}

                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontWeight: 700,
                                            }}
                                        >
                                            {inspection.fileName}
                                        </Typography>
                                    </Stack>

                                    <Typography variant="body2">
                                        Protocols:{" "}
                                        {inspection.protocolsCount ??
                                            "Unknown"}
                                    </Typography>

                                    <Typography variant="body2">
                                        Required plugins:{" "}
                                        {inspection
                                            .requiredPluginNames
                                            .length
                                            ? inspection
                                                .requiredPluginNames
                                                .join(", ")
                                            : "None declared"}
                                    </Typography>

                                    {inspection
                                        .missingPluginNames
                                        .length > 0 && (
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontWeight: 700,
                                                    color:
                                                        "warning.main",
                                                }}
                                            >
                                                Missing plugins:{" "}
                                                {inspection
                                                    .missingPluginNames
                                                    .join(", ")}
                                            </Typography>
                                        )}

                                    {!inspection.canLoad &&
                                        inspection.disabledReason && (
                                            <Typography
                                                variant="body2"
                                            >
                                                {
                                                    inspection.disabledReason
                                                }
                                            </Typography>
                                        )}
                                </Stack>
                            </Box>
                        )}

                        {inspection?.canLoad && (
                            <>
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            mb: 0.75,
                                            fontWeight: 600,
                                        }}
                                    >
                                        Destination
                                    </Typography>

                                    <Stack
                                        direction="row"
                                        spacing={1}
                                    >
                                        <Button
                                            fullWidth
                                            variant={
                                                mode === "create"
                                                    ? "contained"
                                                    : "outlined"
                                            }
                                            onClick={() =>
                                                setMode("create")
                                            }
                                            sx={{
                                                textTransform:
                                                    "none",
                                            }}
                                        >
                                            Create new
                                        </Button>

                                        <Button
                                            fullWidth
                                            variant={
                                                mode === "select"
                                                    ? "contained"
                                                    : "outlined"
                                            }
                                            onClick={() =>
                                                setMode("select")
                                            }
                                            sx={{
                                                textTransform:
                                                    "none",
                                            }}
                                        >
                                            Existing project
                                        </Button>
                                    </Stack>
                                </Box>

                                {mode === "create" ? (
                                    <Stack spacing={2}>
                                        <TextField
                                            size="small"
                                            label="Project name"
                                            value={
                                                newProjectTitle
                                            }
                                            onChange={(event) =>
                                                setNewProjectTitle(
                                                    event.target
                                                        .value,
                                                )
                                            }
                                        />

                                        <TextField
                                            size="small"
                                            label="Description"
                                            multiline
                                            rows={3}
                                            value={
                                                newProjectDescription
                                            }
                                            onChange={(event) =>
                                                setNewProjectDescription(
                                                    event.target
                                                        .value,
                                                )
                                            }
                                        />
                                    </Stack>
                                ) : (
                                    <Box>
                                        <FormControl
                                            fullWidth
                                            size="small"
                                        >
                                            <Select
                                                value={
                                                    selectedProjectId
                                                }
                                                displayEmpty
                                                disabled={
                                                    projectsLoading ||
                                                    !!projectsError
                                                }
                                                onChange={(event) =>
                                                    setSelectedProjectId(
                                                        String(
                                                            event.target
                                                                .value,
                                                        ),
                                                    )
                                                }
                                            >
                                                <MenuItem value="">
                                                    {projectsLoading
                                                        ? "Loading projects…"
                                                        : "Select a project"}
                                                </MenuItem>

                                                {projectOptions.map(
                                                    (project) => (
                                                        <MenuItem
                                                            key={
                                                                project.id
                                                            }
                                                            value={
                                                                project.id
                                                            }
                                                        >
                                                            {
                                                                project.name
                                                            }
                                                        </MenuItem>
                                                    ),
                                                )}
                                            </Select>
                                        </FormControl>

                                        {projectsError && (
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    mt: 1,
                                                    color:
                                                        "error.main",
                                                }}
                                            >
                                                {projectsError}
                                            </Typography>
                                        )}
                                    </Box>
                                )}
                            </>
                        )}
                    </Stack>
                </DialogContent>

                <DialogActions
                    sx={{
                        px: 2.5,
                        py: 1.75,
                        borderTop: `1px solid ${alpha(
                            theme.palette.divider,
                            0.9,
                        )}`,
                        gap: 1,
                    }}
                >
                    <Button
                        onClick={onClose}
                        variant="outlined"
                        disabled={submitting}
                        sx={{
                            textTransform: "none",
                            borderRadius: 3,
                        }}
                    >
                        Cancel
                    </Button>

                    <Button
                        onClick={handleImport}
                        variant="contained"
                        color="info"
                        disabled={importDisabled}
                        sx={{
                            textTransform: "none",
                            borderRadius: 3,
                            minWidth: 110,
                        }}
                    >
                        {submitting
                            ? "Importing…"
                            : "Import"}
                    </Button>
                </DialogActions>
            </Dialog>

            {browserOpen && (
                <RemoteFileDialog
                    key={browserKey}
                    open={browserOpen}
                    onClose={() =>
                        setBrowserOpen(false)
                    }
                    title="Select workflow JSON"
                    confirmLabel="Select workflow"
                    resolveBrowserPaths={() =>
                        svc.resolveBrowserPaths(
                            -1,
                            -1,
                        )
                    }
                    listRemoteDirectory={
                        listWorkflowDirectory
                    }
                    previewRemoteEntry={(path) =>
                        svc.previewRemoteEntry(
                            -1,
                            -1,
                            path,
                        )
                    }
                    onPick={(path, entry) => {
                        const fileName =
                            entry.name.toLowerCase();

                        const isWorkflowFile =
                            fileName.endsWith(".json") ||
                            fileName.endsWith(".template");

                        if (
                            entry.isDir ||
                            !isWorkflowFile
                        ) {
                            toast.error(
                                "Select a .json or .template workflow file.",
                            );
                            return;
                        }

                        setBrowserOpen(false);

                        void inspectFile(path);
                    }}
                />
            )}
        </>
    );
}