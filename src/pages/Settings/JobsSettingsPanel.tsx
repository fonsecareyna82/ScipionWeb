import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import {
    Alert,
    Box,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Paper,
    Stack,
    Tab,
    Tabs,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    Button,
} from "@mui/material";

import {
    Activity,
    Cpu,
    History,
    Server,
    Play,
    RefreshCw,
    Square,
} from "lucide-react";

import { useProjectService } from "@/ProjectServiceContext";
import {
    controlJobWorker,
    type JobWorkerAction,
    type JobWorkerKind,
} from "@/api/settings";

import type {
    ActiveProtocolJob,
    JobMonitoringOverview,
    RecentProtocolJob,
} from "@/services/ProjectService";


const AUTO_REFRESH_MS = 3000;
const RECENT_LIMIT = 25;

const protocolStatusColors:
    Record<
        string,
        {
            backgroundColor: string;
            color: string;
        }
    > = {
    running: {
        backgroundColor: "#918516",
        color: "#FFFFFF",
    },
    saved: {
        backgroundColor: "#1E90FF",
        color: "#FFFFFF",
    },
    launched: {
        backgroundColor: "#1E90FF",
        color: "#FFFFFF",
    },
    finished: {
        backgroundColor: "#28A745",
        color: "#FFFFFF",
    },
    failed: {
        backgroundColor: "#DC3545",
        color: "#FFFFFF",
    },
    aborted: {
        backgroundColor: "#DC3545",
        color: "#FFFFFF",
    },
    interactive: {
        backgroundColor: "#FFC107",
        color: "#1F2937",
    },
    scheduled: {
        backgroundColor: "#918516",
        color: "#FFFFFF",
    },
    new: {
        backgroundColor: "#1E90FF",
        color: "#FFFFFF",
    },
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
            backgroundColor: "#6B7280",
            color: "#FFFFFF",
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


function RuntimeCell({
    job,
}: {
    job: ActiveProtocolJob;
}) {
    const hasRuntimeInfo =
        job.workerPid != null
        || job.protocolPid != null
        || job.jobIds.length > 0;

    if (!hasRuntimeInfo) {
        return (
            <Typography
                variant="caption"
                color="text.secondary"
            >
                —
            </Typography>
        );
    }

    return (
        <Stack spacing={0.25}>
            {job.workerPid != null ? (
                <Typography variant="caption">
                    Celery PID: {job.workerPid}
                </Typography>
            ) : null}

            {job.protocolPid != null ? (
                <Typography variant="caption">
                    Protocol PID: {job.protocolPid}
                </Typography>
            ) : null}

            {job.jobIds.length > 0 ? (
                <Typography variant="caption">
                    {job.jobIds.length === 1
                        ? "Queue job: "
                        : "Queue jobs: "}
                    {job.jobIds.join(", ")}
                </Typography>
            ) : null}
        </Stack>
    );
}


export default function JobsSettingsPanel() {
    const svc = useProjectService();

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

    const [workerAction, setWorkerAction] =
        useState<string | null>(null);

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
                const confirmed =
                    window.confirm(
                        `The ${workerKind} worker has `
                        + `${activeTasks} active task(s). `
                        + `${action === "restart"
                            ? "Restarting"
                            : "Stopping"} it may interrupt them. Continue?`
                    );

                if (!confirmed) {
                    return;
                }
            }

            const actionKey =
                `${workerKind}:${action}`;

            setWorkerAction(actionKey);
            setError(null);

            try {
                await controlJobWorker(
                    workerKind,
                    action,
                );

                await loadJobs(false);

            } catch (requestError: any) {
                setError(
                    getErrorMessage(
                        requestError
                    )
                );

            } finally {
                setWorkerAction(null);
            }
        },
        [loadJobs],
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


    return (
        <Stack spacing={2}>
            <Stack
                direction={{
                    xs: "column",
                    sm: "row",
                }}
                spacing={1.5}
                alignItems={{
                    xs: "flex-start",
                    sm: "center",
                }}
                justifyContent="space-between"
            >
                <Box>
                    <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                    >
                        <Activity size={18} />

                        <Typography
                            variant="h6"
                            sx={{
                                fontWeight: 800,
                            }}
                        >
                            Jobs monitor
                        </Typography>

                        <Chip
                            size="small"
                            color={
                                data.celeryAvailable
                                    ? "success"
                                    : "warning"
                            }
                            label={
                                data.celeryAvailable
                                    ? "Celery online"
                                    : "Celery unavailable"
                            }
                        />
                    </Stack>

                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                    >
                        Last update:{" "}
                        {formatDate(
                            data.refreshedAt,
                        )}
                    </Typography>
                </Box>

            </Stack>


            {!data.celeryAvailable ? (
                <Alert severity="warning">
                    {data.celeryError
                        || "No Celery workers responded. PostgreSQL history remains available."}
                </Alert>
            ) : null}


            {error ? (
                <Alert severity="warning">
                    {error}
                </Alert>
            ) : null}


            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "1fr",
                        md: "repeat(2, minmax(0, 1fr))",
                    },
                    gap: 2,
                }}
            >
                {data.workers.map(
                    (worker) => (
                        <Card
                            key={worker.name}
                            variant="outlined"
                        >
                            <CardContent>
                                <Stack
                                    direction="row"
                                    alignItems="flex-start"
                                    justifyContent="space-between"
                                    spacing={2}
                                >
                                    <Stack
                                        direction="row"
                                        spacing={1.25}
                                        alignItems="center"
                                    >
                                        {worker.name.startsWith(
                                            "protocols@",
                                        ) ? (
                                            <Cpu size={20} />
                                        ) : (
                                            <Server size={20} />
                                        )}

                                        <Box>
                                            <Typography
                                                sx={{
                                                    fontSize: 14,
                                                    fontWeight: 800,
                                                }}
                                            >
                                                {worker.name}
                                            </Typography>

                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                            >
                                                Queue:{" "}
                                                {worker.queues.length
                                                    ? worker.queues.join(
                                                        ", ",
                                                    )
                                                    : "—"}
                                            </Typography>
                                        </Box>
                                    </Stack>

                                    <Chip
                                        size="small"
                                        color={
                                            worker.online
                                                ? "success"
                                                : "default"
                                        }
                                        label={
                                            worker.online
                                                ? "Online"
                                                : "Offline"
                                        }
                                    />
                                </Stack>

                                <Box
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns:
                                            "repeat(3, 1fr)",
                                        gap: 1,
                                        mt: 2,
                                    }}
                                >
                                    <Box>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                        >
                                            Concurrency
                                        </Typography>

                                        <Typography
                                            sx={{
                                                fontWeight: 800,
                                            }}
                                        >
                                            {worker.concurrency}
                                        </Typography>
                                    </Box>

                                    <Box>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                        >
                                            Active
                                        </Typography>

                                        <Typography
                                            sx={{
                                                fontWeight: 800,
                                            }}
                                        >
                                            {worker.active}
                                        </Typography>
                                    </Box>

                                    <Box>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                        >
                                            Reserved
                                        </Typography>

                                        <Typography
                                            sx={{
                                                fontWeight: 800,
                                            }}
                                        >
                                            {worker.reserved}
                                        </Typography>
                                    </Box>

                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        justifyContent="flex-end"
                                        sx={{ mt: 2 }}
                                    >
                                        {worker.state === "offline" ? (
                                            <Button
                                                size="small"
                                                variant="contained"
                                                startIcon={<Play size={15} />}
                                                disabled={
                                                    workerAction !== null
                                                }
                                                onClick={() => {
                                                    void handleWorkerAction(
                                                        worker.kind as JobWorkerKind,
                                                        "start",
                                                        worker.active,
                                                    );
                                                }}
                                            >
                                                Start
                                            </Button>
                                        ) : (
                                            <>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    startIcon={<Square size={15} />}
                                                    disabled={
                                                        workerAction !== null
                                                        || !worker.pid
                                                    }
                                                    onClick={() => {
                                                        void handleWorkerAction(
                                                            worker.kind as JobWorkerKind,
                                                            "stop",
                                                            worker.active,
                                                        );
                                                    }}
                                                >
                                                    Stop
                                                </Button>

                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    startIcon={<RefreshCw size={15} />}
                                                    disabled={
                                                        workerAction !== null
                                                        || !worker.pid
                                                    }
                                                    onClick={() => {
                                                        void handleWorkerAction(
                                                            worker.kind as JobWorkerKind,
                                                            "restart",
                                                            worker.active,
                                                        );
                                                    }}
                                                >
                                                    Restart
                                                </Button>
                                            </>
                                        )}
                                    </Stack>
                                </Box>
                            </CardContent>
                        </Card>
                    ),
                )}
            </Box>

            <Paper
                elevation={0}
                sx={{
                    p: 0.5,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 2.5,
                    bgcolor: "action.hover",
                }}
            >
                <Tabs
                    value={jobsView}
                    onChange={(
                        _,
                        value: "active" | "recent",
                    ) => {
                        setJobsView(value);
                    }}
                    variant="fullWidth"
                    aria-label="Job monitoring views"
                    sx={{
                        minHeight: 44,

                        "& .MuiTabs-indicator": {
                            display: "none",
                        },

                        "& .MuiTab-root": {
                            minHeight: 44,
                            borderRadius: 2,
                            textTransform: "none",
                            fontSize: 13,
                            fontWeight: 800,
                            color: "text.secondary",
                            transition: "all 160ms ease",
                        },

                        "& .MuiTab-root.Mui-selected": {
                            bgcolor: "background.paper",
                            color: "text.primary",
                            boxShadow: 1,
                        },
                    }}
                >
                    <Tab
                        disableRipple
                        value="active"
                        label={
                            <Stack
                                component="span"
                                direction="row"
                                spacing={1}
                                alignItems="center"
                            >
                                <Activity size={16} />

                                <Box component="span">
                                    Active
                                </Box>

                                <Box
                                    component="span"
                                    sx={{
                                        minWidth: 22,
                                        height: 22,
                                        px: 0.75,
                                        borderRadius: 999,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        bgcolor: "action.selected",
                                        fontSize: 11,
                                        fontWeight: 900,
                                        lineHeight: 1,
                                    }}
                                >
                                    {data.activeJobs.length}
                                </Box>
                            </Stack>
                        }
                    />

                    <Tab
                        disableRipple
                        value="recent"
                        label={
                            <Stack
                                component="span"
                                direction="row"
                                spacing={1}
                                alignItems="center"
                            >
                                <History size={16} />

                                <Box component="span">
                                    Recent
                                </Box>

                                <Box
                                    component="span"
                                    sx={{
                                        minWidth: 22,
                                        height: 22,
                                        px: 0.75,
                                        borderRadius: 999,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        bgcolor: "action.selected",
                                        fontSize: 11,
                                        fontWeight: 900,
                                        lineHeight: 1,
                                    }}
                                >
                                    {data.recentJobs.length}
                                </Box>
                            </Stack>
                        }
                    />
                </Tabs>
            </Paper>

            {jobsView === "active" ? (
                <Card variant="outlined">
                    <CardContent>
                        {data.activeJobs.length === 0 ? (
                            <Alert severity="success">
                                No active protocol jobs.
                            </Alert>
                        ) : (
                            <TableContainer
                                component={Paper}
                                variant="outlined"
                                sx={{
                                    maxHeight: {
                                        xs: 340,
                                        md: 420,
                                    },
                                    overflowY: "auto",
                                }}
                            >
                                <Table
                                    size="small"
                                    stickyHeader
                                >
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Project</TableCell>
                                            <TableCell>Protocol</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Execution</TableCell>
                                            <TableCell>Runtime</TableCell>
                                            <TableCell align="right">
                                                Elapsed
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>

                                    <TableBody>
                                        {data.activeJobs.map(
                                            (job) => (
                                                <TableRow
                                                    key={job.taskId}
                                                    hover
                                                >
                                                    <TableCell>
                                                        <Typography
                                                            title={
                                                                job.projectName
                                                                ?? undefined
                                                            }
                                                            sx={{
                                                                fontSize: 12,
                                                                fontWeight: 700,
                                                            }}
                                                        >
                                                            {getProjectLabel(
                                                                job.projectName,
                                                                job.projectId,
                                                            )}
                                                        </Typography>

                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                        >
                                                            Project {job.projectId}
                                                        </Typography>
                                                    </TableCell>

                                                    <TableCell>
                                                        <Typography
                                                            sx={{
                                                                fontSize: 12,
                                                                fontWeight: 700,
                                                            }}
                                                        >
                                                            {job.protocolClassName
                                                                || "Protocol"}
                                                        </Typography>

                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                        >
                                                            #{job.protocolId}
                                                            {job.runMode !== "unknown"
                                                                ? ` · ${job.runMode}`
                                                                : ""}
                                                        </Typography>
                                                    </TableCell>

                                                    <TableCell>
                                                        <Stack
                                                            spacing={0.5}
                                                            alignItems="flex-start"
                                                        >
                                                            <Chip
                                                                size="small"
                                                                label={
                                                                    job.protocolStatus
                                                                    || "unknown"
                                                                }
                                                                sx={{
                                                                    ...getProtocolStatusSx(
                                                                        job.protocolStatus,
                                                                    ),
                                                                    fontWeight: 700,
                                                                }}
                                                            />

                                                            {job.celeryState ? (
                                                                <Typography
                                                                    variant="caption"
                                                                    color="text.secondary"
                                                                >
                                                                    Celery:{" "}
                                                                    {job.celeryState}
                                                                </Typography>
                                                            ) : null}

                                                            {job.step ? (
                                                                <Typography
                                                                    variant="caption"
                                                                    color="text.secondary"
                                                                >
                                                                    {job.step}
                                                                </Typography>
                                                            ) : null}
                                                        </Stack>
                                                    </TableCell>

                                                    <TableCell>
                                                        <Typography
                                                            sx={{
                                                                fontSize: 12,
                                                                fontWeight: 700,
                                                            }}
                                                        >
                                                            {job.worker
                                                                ? job.worker
                                                                : job.jobIds.length > 0
                                                                    ? (
                                                                        job.protocolPid
                                                                            ? "Queue steps runtime"
                                                                            : "Queued protocol"
                                                                    )
                                                                    : job.protocolPid
                                                                        ? "Local protocol"
                                                                        : "Protocol runtime"}
                                                        </Typography>

                                                        {job.worker && job.queue ? (
                                                            <Typography
                                                                variant="caption"
                                                                color="text.secondary"
                                                            >
                                                                Queue: {job.queue}
                                                            </Typography>
                                                        ) : null}
                                                    </TableCell>

                                                    <TableCell>
                                                        <RuntimeCell
                                                            job={job}
                                                        />
                                                    </TableCell>

                                                    <TableCell align="right">
                                                        {formatDuration(
                                                            job.elapsedSeconds,
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ),
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </CardContent>
                </Card>
            ) : null}


            {jobsView === "recent" ? (
                <Card variant="outlined">
                    <CardContent>
                        {data.recentJobs.length === 0 ? (
                            <Alert severity="info">
                                No recent protocol executions.
                            </Alert>
                        ) : (
                            <TableContainer
                                component={Paper}
                                variant="outlined"
                                sx={{
                                    maxHeight: {
                                        xs: 340,
                                        md: 420,
                                    },
                                    overflowY: "auto",
                                }}
                            >
                                <Table
                                    size="small"
                                    stickyHeader
                                >
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Project</TableCell>
                                            <TableCell>Protocol</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Runtime</TableCell>
                                            <TableCell align="right">
                                                Updated
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>

                                    <TableBody>
                                        {data.recentJobs.map(
                                            (
                                                job: RecentProtocolJob,
                                            ) => (
                                                <TableRow
                                                    key={
                                                        `${job.projectId}-${job.protocolId}`
                                                    }
                                                    hover
                                                >
                                                    <TableCell>
                                                        <Typography
                                                            title={job.projectName}
                                                            sx={{
                                                                fontSize: 12,
                                                                fontWeight: 700,
                                                            }}
                                                        >
                                                            {getProjectLabel(
                                                                job.projectName,
                                                                job.projectId,
                                                            )}
                                                        </Typography>

                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                        >
                                                            Project {job.projectId}
                                                        </Typography>
                                                    </TableCell>

                                                    <TableCell>
                                                        <Typography
                                                            sx={{
                                                                fontSize: 12,
                                                                fontWeight: 700,
                                                            }}
                                                        >
                                                            {job.protocolClassName}
                                                        </Typography>

                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                        >
                                                            #{job.protocolId}
                                                        </Typography>
                                                    </TableCell>

                                                    <TableCell>
                                                        <Chip
                                                            size="small"
                                                            label={job.status}
                                                            sx={{
                                                                ...getProtocolStatusSx(
                                                                    job.status,
                                                                ),
                                                                fontWeight: 700,
                                                            }}
                                                        />
                                                    </TableCell>

                                                    <TableCell>
                                                        <Typography
                                                            sx={{
                                                                fontSize: 12,
                                                            }}
                                                        >
                                                            {formatDuration(
                                                                job.elapsedTimeSeconds,
                                                            )}
                                                        </Typography>

                                                        {job.jobIds.length > 0 ? (
                                                            <Typography
                                                                variant="caption"
                                                                color="text.secondary"
                                                            >
                                                                Job{" "}
                                                                {job.jobIds.join(", ")}
                                                            </Typography>
                                                        ) : null}
                                                    </TableCell>

                                                    <TableCell align="right">
                                                        <Typography
                                                            sx={{
                                                                fontSize: 12,
                                                            }}
                                                        >
                                                            {formatDate(
                                                                job.updatedAt
                                                                || job.createdAt,
                                                            )}
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            ),
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </CardContent>
                </Card>
            ) : null}
        </Stack>
    );
}