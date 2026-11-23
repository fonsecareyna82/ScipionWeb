import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import toast from "react-hot-toast";

import {
    Alert,
    Box,
    CircularProgress,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
    Button,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import {
    Activity,
    Cpu,
    HardDrive,
    History,
    Puzzle,
    Server,
    Play,
    RefreshCw,
    Square,
    TriangleAlert,
} from "lucide-react";

import SettingsDialog from "./SettingsDialog";

import { useProjectService } from "@/ProjectServiceContext";
import {
    controlJobWorker,
    type JobWorkerAction,
    type JobWorkerKind,
} from "@/api/settings";

import type {
    ActiveProtocolJob,
    JobMonitoringOverview,
    NodeCapabilities,
    NodeCapabilitiesList,
    RecentProtocolJob,
} from "@/services/ProjectService";
import NodeScratch from "./NodeScratch";
import { choiceButtonsSx, SETTINGS_TEXT, SettingsSection } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";
import { usePermissions } from "@/hooks/usePermissions";


const AUTO_REFRESH_MS = 3000;
const RECENT_LIMIT = 25;

// The same colours as the protocol badges elsewhere in the app
const protocolStatusColors: Record<string, { backgroundColor: string; color: string }> = {
    running: { backgroundColor: "#f59e0b", color: "#1f2937" },
    scheduled: { backgroundColor: "#facc15", color: "#1f2937" },
    interactive: { backgroundColor: "#facc15", color: "#1f2937" },
    finished: { backgroundColor: "#16a34a", color: "#ffffff" },
    failed: { backgroundColor: "#dc2626", color: "#ffffff" },
    aborted: { backgroundColor: "#dc2626", color: "#ffffff" },
    saved: { backgroundColor: "#2563eb", color: "#ffffff" },
    launched: { backgroundColor: "#2563eb", color: "#ffffff" },
    new: { backgroundColor: "#2563eb", color: "#ffffff" },
};


function getProtocolStatusSx(
    status: string,
) {
    const normalizedStatus = String(
        status || "",
    )
        .trim()
        .toLowerCase();

    return (
        protocolStatusColors[
        normalizedStatus
        ]
        ?? {
            backgroundColor: "#4b5563",
            color: "#ffffff",
        }
    );
}


function getProjectLabel(
    projectName: string | null | undefined,
    projectId: number,
): string {
    const normalized = String(
        projectName || "",
    )
        .replace(/\\/g, "/")
        .replace(/\/+$/, "");

    if (!normalized) {
        return `Project ${projectId}`;
    }

    const parts = normalized.split("/");
    return (
        parts[parts.length - 1]
        || `Project ${projectId}`
    );
}


function formatDuration(
    rawSeconds: number | null | undefined,
): string {
    const value = Number(rawSeconds);

    if (!Number.isFinite(value)) {
        return "—";
    }

    const totalSeconds = Math.max(
        0,
        Math.round(value),
    );

    const hours = Math.floor(
        totalSeconds / 3600,
    );

    const minutes = Math.floor(
        (totalSeconds % 3600) / 60,
    );

    const seconds =
        totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}


function formatBytes(
    value: unknown,
): string {
    const bytes = Number(value);

    if (
        !Number.isFinite(bytes)
        || bytes <= 0
    ) {
        return "—";
    }

    const gib = bytes / (1024 ** 3);

    if (gib >= 1) {
        return `${gib.toFixed(gib >= 100 ? 0 : 1)} GiB`;
    }

    const mib = bytes / (1024 ** 2);

    return `${mib.toFixed(0)} MiB`;
}


function formatDate(
    value: string | null | undefined,
): string {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}


function getErrorMessage(
    error: any,
): string {
    const detail =
        error?.data?.detail
        ?? error?.detail;

    if (
        typeof detail === "string"
        && detail.trim()
    ) {
        return detail;
    }

    if (
        typeof error?.message === "string"
        && error.message.trim()
    ) {
        return error.message;
    }

    return "Failed to load job monitoring data.";
}


function formatTime(value: string | null | undefined): string {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}


/** A worker as people call it: what it does. */
export function workerTitle(worker: { kind?: string | null; name: string }): string {
    const kind = worker.kind ?? (worker.name.startsWith("plugins@") ? "plugins" : "protocols");
    return kind === "plugins" ? "Plugin installer" : "Protocol runner";
}


/** Where an active run is executed. */
function executionLabel(job: ActiveProtocolJob): string {
    if (job.worker) return workerTitle({ name: job.worker }) + (job.worker.includes("@") ? ` on ${job.worker.split("@")[1]}` : "");
    if (job.jobIds.length > 0) return job.protocolPid ? "Steps through the queue" : "Through the queue";
    return job.protocolPid ? "On this server" : "—";
}


function RuntimeCell({ job, textSx }: { job: ActiveProtocolJob; textSx: object }) {
    const lines = [
        job.workerPid != null ? `Worker process ${job.workerPid}` : null,
        job.protocolPid != null ? `Protocol process ${job.protocolPid}` : null,
        job.jobIds.length > 0 ? `${job.jobIds.length === 1 ? "Queue job" : "Queue jobs"} ${job.jobIds.join(", ")}` : null,
    ].filter(Boolean) as string[];
    if (!lines.length) return <Typography sx={textSx}>—</Typography>;
    return (
        <Stack spacing={0.25}>
            {lines.map((line) => <Typography key={line} sx={textSx}>{line}</Typography>)}
        </Stack>
    );
}


/** A node's plugins: the first ones, and all of them on request. */
function NodePlugins({ plugins, textSx, colors }: {
    plugins: NodeCapabilities["plugins"]; textSx: object; colors: { border: string; text: string };
}) {
    const [all, setAll] = useState(false);
    const shown = all ? plugins : plugins.slice(0, 8);
    return (
        <Box>
            <Typography sx={{ ...textSx, mb: 0.75 }}>Plugins ({plugins.length})</Typography>
            {plugins.length ? (
                <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75}>
                    {shown.map((plugin) => (
                        <Box key={plugin.pipName ?? plugin.name} component="span"
                             sx={{ px: 1, py: 0.25, borderRadius: 999, border: "1px solid", borderColor: colors.border,
                                   fontSize: 13, color: colors.text, whiteSpace: "nowrap" }}>
                            {(plugin.name || plugin.pipName || "unknown") + (plugin.pipVersion ? ` ${plugin.pipVersion}` : "")}
                        </Box>
                    ))}
                    {plugins.length > 8 && (
                        <Button size="small" onClick={() => setAll((value) => !value)}
                                sx={{ textTransform: "none", fontSize: 13.5, py: 0, minWidth: 0 }}>
                            {all ? "Show fewer" : `Show all ${plugins.length}`}
                        </Button>
                    )}
                </Stack>
            ) : (
                <Typography sx={textSx}>None reported.</Typography>
            )}
        </Box>
    );
}


export default function JobsSettingsPanel() {
    const svc = useProjectService();
    const { can } = usePermissions();
    const isDarkMode = useTheme().palette.mode === "dark";
    const { colors, actionButtonSx, saveButtonSx } = useSettingsStyles(isDarkMode);

    const [data, setData] =
        useState<JobMonitoringOverview | null>(
            null,
        );

    const [loading, setLoading] =
        useState(true);


    const [available, setAvailable] =
        useState(true);

    const [error, setError] =
        useState<string | null>(null);

    const [nodeCapabilities, setNodeCapabilities] =
        useState<NodeCapabilitiesList | null>(null);

    const [nodeCapabilitiesLoading, setNodeCapabilitiesLoading] =
        useState(false);

    const [nodeCapabilitiesError, setNodeCapabilitiesError] =
        useState<string | null>(null);

    const nodeCapabilitiesInFlightRef =
        useRef(false);

    const [workerAction, setWorkerAction] =
        useState<string | null>(null);

    // A stop or restart that would interrupt active tasks waits for the user to confirm it
    const [pendingWorkerAction, setPendingWorkerAction] =
        useState<{
            workerKind: JobWorkerKind;
            action: JobWorkerAction;
            activeTasks: number;
        } | null>(null);

    const requestInFlightRef =
        useRef(false);


    const [jobsView, setJobsView] =
        useState<"active" | "recent">(
            "active",
        );

    const loadJobs = useCallback(
        async (
            background: boolean = false,
        ) => {
            if (requestInFlightRef.current) {
                return;
            }

            requestInFlightRef.current = true;

            if (!background) {
                setLoading(true);
            }

            setError(null);

            try {
                const result =
                    await svc.fetchJobsOverview(
                        RECENT_LIMIT,
                    );

                setData(result);
                setAvailable(true);

            } catch (requestError: any) {
                const status =
                    requestError?.status
                    ?? requestError?.response?.status;

                if (status === 403) {
                    setAvailable(false);
                    setData(null);
                    return;
                }

                setError(
                    getErrorMessage(
                        requestError,
                    ),
                );

            } finally {
                requestInFlightRef.current =
                    false;

                setLoading(false);
            }
        },
        [svc],
    );


    const loadNodeCapabilities = useCallback(
        async () => {
            if (nodeCapabilitiesInFlightRef.current) {
                return;
            }

            nodeCapabilitiesInFlightRef.current = true;
            setNodeCapabilitiesLoading(true);
            setNodeCapabilitiesError(null);

            try {
                const result =
                    await svc.fetchJobNodeCapabilities();

                setNodeCapabilities(result);

            } catch (requestError: any) {
                const status =
                    requestError?.status
                    ?? requestError?.response?.status;

                if (status === 403) {
                    setNodeCapabilities(null);
                    return;
                }

                setNodeCapabilitiesError(
                    getErrorMessage(requestError),
                );

            } finally {
                nodeCapabilitiesInFlightRef.current =
                    false;

                setNodeCapabilitiesLoading(false);
            }
        },
        [svc],
    );


    const runWorkerAction = useCallback(
        async (
            workerKind: JobWorkerKind,
            action: JobWorkerAction,
        ) => {
            const actionKey =
                `${workerKind}:${action}`;

            setWorkerAction(actionKey);
            setError(null);

            try {
                await controlJobWorker(
                    workerKind,
                    action,
                );

                const workerLabel =
                    workerKind === "protocols"
                        ? "Protocol worker"
                        : "Plugin worker";

                const actionLabel =
                    action === "start"
                        ? "started"
                        : action === "stop"
                            ? "stopped"
                            : "restarted";

                toast.success(
                    `${workerLabel} ${actionLabel}.`
                );

                await loadJobs(false);

            } catch (requestError: any) {
                const message =
                    getErrorMessage(
                        requestError
                    );

                setError(message);
                toast.error(message);

            } finally {
                setWorkerAction(null);
            }
        },
        [loadJobs],
    );


    const handleWorkerAction = useCallback(
        async (
            workerKind: JobWorkerKind,
            action: JobWorkerAction,
            activeTasks: number,
        ) => {
            if (
                activeTasks > 0
                && (
                    action === "stop"
                    || action === "restart"
                )
            ) {
                setPendingWorkerAction({
                    workerKind,
                    action,
                    activeTasks,
                });
                return;
            }

            await runWorkerAction(
                workerKind,
                action,
            );
        },
        [runWorkerAction],
    );


    useEffect(() => {
        if (!available) {
            return;
        }

        void loadJobs(false);

        const timer =
            window.setInterval(
                () => {
                    void loadJobs(true);
                },
                AUTO_REFRESH_MS,
            );

        return () => {
            window.clearInterval(timer);
        };
    }, [
        available,
        loadJobs,
    ]);


    useEffect(() => {
        if (!available) {
            return;
        }

        // Node capabilities broadcast to every node (nvidia-smi + plugin
        // listing per host), so this is loaded once on mount and via the
        // manual "Refresh nodes" button rather than the 3s job-status poll.
        void loadNodeCapabilities();
    }, [
        available,
        loadNodeCapabilities,
    ]);


    if (!available) {
        return (
            <Alert severity="info">
                Job monitoring is restricted to admin users.
            </Alert>
        );
    }


    if (
        loading
        && data === null
    ) {
        return (
            <Box
                sx={{
                    minHeight: 220,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <CircularProgress size={28} />
            </Box>
        );
    }


    if (
        data === null
        && error
    ) {
        return (
            <Alert severity="error">
                {error}
            </Alert>
        );
    }


    if (data === null) {
        return null;
    }


    const sectionColors = { ...colors, hover: colors.hover };
    const text = { fontSize: SETTINGS_TEXT.text, color: colors.muted } as const;
    const strong = { fontSize: SETTINGS_TEXT.control, fontWeight: 600, color: colors.text } as const;
    const headCellSx = {
        fontSize: SETTINGS_TEXT.text, fontWeight: 700, color: colors.muted, bgcolor: colors.card,
        borderColor: colors.border, whiteSpace: "nowrap",
    } as const;
    const cellSx = { fontSize: SETTINGS_TEXT.control, color: colors.text, borderColor: colors.border,
                     verticalAlign: "top" } as const;
    const allOnline = data.workers.length > 0 && data.workers.every((worker) => worker.online);

    const statusChip = (status: string | null | undefined) => {
        const look = getProtocolStatusSx(status ?? "");
        return (
            <Box component="span" sx={{ display: "inline-block", px: 1, py: 0.25, borderRadius: 999,
                                         fontSize: 13, fontWeight: 700, textTransform: "capitalize", ...look }}>
                {status || "unknown"}
            </Box>
        );
    };

    const stateBadge = (online: boolean, label: string) => (
        <Stack direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: online ? "#16a34a" : "#9ca3af" }} />
            <Typography sx={{ fontSize: SETTINGS_TEXT.text, fontWeight: 600, color: colors.text }}>{label}</Typography>
        </Stack>
    );

    const tableBox = (children: React.ReactNode) => (
        <TableContainer sx={{ maxHeight: { xs: 360, md: 460 }, overflowY: "auto", border: "1px solid",
                              borderColor: colors.border, borderRadius: 2 }}>
            {children}
        </TableContainer>
    );

    return (
        <Stack spacing={2}>
            {error ? <Alert severity="warning">{error}</Alert> : null}

            <SettingsSection
                icon={<Server size={19} />}
                title="Workers"
                subtitle={`The background services that run protocols and install plugins. Updated every 3 s, last at ${
                    formatTime(data.refreshedAt)}.`}
                actions={data.workers.length ? stateBadge(allOnline, allOnline ? "All answering" : "Not all answering")
                    : null}
                colors={sectionColors}
                isDarkMode={isDarkMode}
            >
                {!data.celeryAvailable ? (
                    <Alert severity="warning" sx={{ my: 1.5 }}>
                        No worker answered. The history of the runs is still available below.
                    </Alert>
                ) : null}
                {data.workers.map((worker) => {
                    const busyWorker = workerAction !== null;
                    const host = worker.name.includes("@") ? worker.name.split("@").slice(1).join("@") : "";
                    return (
                        <Box key={worker.name} data-testid={`worker-${worker.name}`}
                             sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2.5, py: 2 }}>
                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: "1 1 260px", minWidth: 0 }}>
                                {worker.kind === "plugins" ? <Puzzle size={20} /> : <Cpu size={20} />}
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontSize: SETTINGS_TEXT.title, fontWeight: 700, color: colors.text }}>
                                        {workerTitle(worker)}
                                    </Typography>
                                    <Typography sx={text} noWrap title={worker.name}>
                                        {[host, worker.queues.length ? `queue ${worker.queues.join(", ")}` : ""]
                                            .filter(Boolean).join(" · ") || worker.name}
                                    </Typography>
                                </Box>
                            </Stack>

                            <Stack direction="row" spacing={3}>
                                {[["Slots", worker.concurrency], ["Running", worker.active], ["Reserved", worker.reserved]]
                                    .map(([label, count]) => (
                                        <Box key={label as string} sx={{ textAlign: "center", minWidth: 56 }}>
                                            <Typography sx={{ fontSize: 18, fontWeight: 800, color: colors.text,
                                                              lineHeight: 1.2 }}>
                                                {count}
                                            </Typography>
                                            <Typography sx={text}>{label}</Typography>
                                        </Box>
                                    ))}
                            </Stack>

                            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ ml: { md: "auto" } }}>
                                <Box sx={{ minWidth: 96 }}>
                                    {stateBadge(worker.online, worker.state === "unresponsive" ? "Not answering"
                                        : worker.online ? "Online" : "Stopped")}
                                </Box>
                                {worker.state === "offline" ? (
                                    <Button size="small" sx={saveButtonSx} startIcon={<Play size={15} />}
                                            disabled={busyWorker}
                                            onClick={() => void handleWorkerAction(worker.kind as JobWorkerKind, "start",
                                                                                   worker.active)}>
                                        Start
                                    </Button>
                                ) : (
                                    <>
                                        <Button size="small" sx={actionButtonSx} startIcon={<RefreshCw size={15} />}
                                                disabled={busyWorker || !worker.pid}
                                                onClick={() => void handleWorkerAction(worker.kind as JobWorkerKind,
                                                                                       "restart", worker.active)}>
                                            Restart
                                        </Button>
                                        <Button size="small" sx={{ ...actionButtonSx, color: "#dc2626" }}
                                                startIcon={<Square size={15} />}
                                                disabled={busyWorker || !worker.pid}
                                                onClick={() => void handleWorkerAction(worker.kind as JobWorkerKind,
                                                                                       "stop", worker.active)}>
                                            Stop
                                        </Button>
                                    </>
                                )}
                            </Stack>
                        </Box>
                    );
                })}
            </SettingsSection>

            <SettingsSection
                icon={<HardDrive size={19} />}
                title="Nodes"
                subtitle="What each machine that runs protocols has: graphics cards, its fast scratch disk and the plugins installed."
                actions={
                    <Button size="small" sx={actionButtonSx} startIcon={<RefreshCw size={15} />}
                            disabled={nodeCapabilitiesLoading} onClick={() => void loadNodeCapabilities()}>
                        {nodeCapabilitiesLoading ? "Refreshing…" : "Refresh"}
                    </Button>
                }
                colors={sectionColors}
                isDarkMode={isDarkMode}
                plain
            >
                <Stack spacing={1.5}>
                    {nodeCapabilitiesError ? <Alert severity="warning">{nodeCapabilitiesError}</Alert> : null}
                    {!nodeCapabilitiesError && nodeCapabilities && !nodeCapabilities.available ? (
                        <Typography sx={text}>{nodeCapabilities.error || "No machine reported what it has."}</Typography>
                    ) : null}
                    {nodeCapabilitiesLoading && nodeCapabilities === null ? (
                        <Box sx={{ minHeight: 80, display: "grid", placeItems: "center" }}><CircularProgress size={22} /></Box>
                    ) : null}
                    {nodeCapabilities && nodeCapabilities.nodes.length > 0 ? (
                        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)" } }}>
                            {nodeCapabilities.nodes.map((node) => (
                                <Box key={node.hostname} data-testid={`node-${node.hostname}`}
                                     sx={{ p: 2, border: "1px solid", borderColor: colors.border, borderRadius: 2 }}>
                                    <Typography sx={{ fontSize: SETTINGS_TEXT.title, fontWeight: 800, color: colors.text,
                                                      mb: 1.25 }}>
                                        {node.hostname}
                                    </Typography>
                                    {node.error ? (
                                        <Alert severity="warning" sx={{ py: 0 }}>{node.error}</Alert>
                                    ) : (
                                        <Stack spacing={1.75}>
                                            <Box>
                                                <Typography sx={{ ...text, mb: 0.75 }}>Graphics cards ({node.gpus.length})</Typography>
                                                {node.gpus.length ? (
                                                    <Stack spacing={0.75}>
                                                        {node.gpus.map((gpu) => (
                                                            <Stack key={gpu.index} direction="row" spacing={1.25}
                                                                   alignItems="center">
                                                                <Cpu size={15} color={colors.primary} />
                                                                <Typography sx={{ ...strong, flex: 1, minWidth: 0 }} noWrap>
                                                                    {gpu.name}
                                                                </Typography>
                                                                <Typography sx={text}>
                                                                    {gpu.memoryTotalBytes ? formatBytes(gpu.memoryTotalBytes) : ""}
                                                                    {"  "}#{gpu.index}
                                                                </Typography>
                                                            </Stack>
                                                        ))}
                                                    </Stack>
                                                ) : (
                                                    <Typography sx={text}>None.</Typography>
                                                )}
                                            </Box>

                                            <NodeScratch hostname={node.hostname} scratch={node.scratch}
                                                         canEdit={can("settings.manage")}
                                                         canClean={can("jobs.manage")}
                                                         onSaved={() => void loadNodeCapabilities()} />

                                            <NodePlugins plugins={node.plugins} textSx={text} colors={colors} />
                                        </Stack>
                                    )}
                                </Box>
                            ))}
                        </Box>
                    ) : null}
                </Stack>
            </SettingsSection>

            <SettingsSection
                icon={<Activity size={19} />}
                title="Protocol runs"
                subtitle={jobsView === "active" ? "What is running now, on every machine."
                    : `The last ${RECENT_LIMIT} runs that ended or changed.`}
                actions={
                    <ToggleButtonGroup exclusive size="small" value={jobsView} aria-label="Protocol runs"
                                       onChange={(_, next) => next && setJobsView(next)}
                                       sx={choiceButtonsSx(sectionColors, isDarkMode)}>
                        <ToggleButton value="active"><Activity size={16} />Running ({data.activeJobs.length})</ToggleButton>
                        <ToggleButton value="recent"><History size={16} />Recent ({data.recentJobs.length})</ToggleButton>
                    </ToggleButtonGroup>
                }
                colors={sectionColors}
                isDarkMode={isDarkMode}
                plain
            >
                {jobsView === "active" ? (
                    data.activeJobs.length === 0 ? (
                        <Typography sx={text}>Nothing is running now.</Typography>
                    ) : tableBox(
                        <Table size="small" stickyHeader aria-label="Running protocols">
                            <TableHead>
                                <TableRow>
                                    {["Project", "Protocol", "Status", "Where", "Processes"].map((label) => (
                                        <TableCell key={label} sx={headCellSx}>{label}</TableCell>
                                    ))}
                                    <TableCell align="right" sx={headCellSx}>Running for</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {data.activeJobs.map((job) => (
                                    <TableRow key={job.taskId} hover>
                                        <TableCell sx={cellSx}>
                                            <Typography sx={strong} title={job.projectName ?? undefined}>
                                                {getProjectLabel(job.projectName, job.projectId)}
                                            </Typography>
                                            <Typography sx={text}>Project {job.projectId}</Typography>
                                        </TableCell>
                                        <TableCell sx={cellSx}>
                                            <Typography sx={strong}>{job.protocolClassName || "Protocol"}</Typography>
                                            <Typography sx={text}>
                                                #{job.protocolId}{job.runMode !== "unknown" ? ` · ${job.runMode}` : ""}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={cellSx}>
                                            {statusChip(job.protocolStatus)}
                                            {job.step ? <Typography sx={{ ...text, mt: 0.5 }}>{job.step}</Typography> : null}
                                        </TableCell>
                                        <TableCell sx={cellSx}>
                                            <Typography sx={strong}>{executionLabel(job)}</Typography>
                                            {job.worker && job.queue ? <Typography sx={text}>Queue {job.queue}</Typography> : null}
                                        </TableCell>
                                        <TableCell sx={cellSx}><RuntimeCell job={job} textSx={text} /></TableCell>
                                        <TableCell align="right" sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                                            {formatDuration(job.elapsedSeconds)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>,
                    )
                ) : (
                    data.recentJobs.length === 0 ? (
                        <Typography sx={text}>No runs yet.</Typography>
                    ) : tableBox(
                        <Table size="small" stickyHeader aria-label="Recent protocol runs">
                            <TableHead>
                                <TableRow>
                                    {["Project", "Protocol", "Status", "Took"].map((label) => (
                                        <TableCell key={label} sx={headCellSx}>{label}</TableCell>
                                    ))}
                                    <TableCell align="right" sx={headCellSx}>Updated</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {data.recentJobs.map((job: RecentProtocolJob) => (
                                    <TableRow key={`${job.projectId}-${job.protocolId}`} hover>
                                        <TableCell sx={cellSx}>
                                            <Typography sx={strong} title={job.projectName}>
                                                {getProjectLabel(job.projectName, job.projectId)}
                                            </Typography>
                                            <Typography sx={text}>Project {job.projectId}</Typography>
                                        </TableCell>
                                        <TableCell sx={cellSx}>
                                            <Typography sx={strong}>{job.protocolClassName}</Typography>
                                            <Typography sx={text}>#{job.protocolId}</Typography>
                                        </TableCell>
                                        <TableCell sx={cellSx}>{statusChip(job.status)}</TableCell>
                                        <TableCell sx={cellSx}>
                                            {formatDuration(job.elapsedTimeSeconds)}
                                            {job.jobIds.length > 0 ? (
                                                <Typography sx={text}>
                                                    {job.jobIds.length === 1 ? "Queue job" : "Queue jobs"} {job.jobIds.join(", ")}
                                                </Typography>
                                            ) : null}
                                        </TableCell>
                                        <TableCell align="right" sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                                            {formatDate(job.updatedAt || job.createdAt)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>,
                    )
                )}
            </SettingsSection>

            {pendingWorkerAction !== null && (
                <SettingsDialog
                    title={`${pendingWorkerAction.action === "restart"
                        ? "Restart"
                        : "Stop"} the ${pendingWorkerAction.workerKind} worker?`}
                    description={`It has ${pendingWorkerAction.activeTasks} active task(s). `
                        + `${pendingWorkerAction.action === "restart"
                            ? "Restarting"
                            : "Stopping"} it may interrupt them.`}
                    icon={<TriangleAlert size={20} color="#fca5a5" />}
                    confirmLabel={pendingWorkerAction.action === "restart"
                        ? "Restart"
                        : "Stop"}
                    destructive
                    maxWidth="xs"
                    onConfirm={() => {
                        const { workerKind, action } = pendingWorkerAction;
                        setPendingWorkerAction(null);
                        void runWorkerAction(
                            workerKind,
                            action,
                        );
                    }}
                    onClose={() => setPendingWorkerAction(null)}
                />
            )}
        </Stack>
    );
}
