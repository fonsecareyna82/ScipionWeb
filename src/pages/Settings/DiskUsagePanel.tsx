import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Chip,
    CircularProgress,
    IconButton,
    LinearProgress,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
    type SxProps,
    type Theme,
} from "@mui/material";
import { RefreshCw, Ruler, X } from "lucide-react";

import { formatBytes } from "@/components/projects/ProjectOverviewPanel";
import { getStorageUsage, measureStorage, type ProjectStorage, type StorageReport } from "@/api/storage";
import { ROUNDED_BUTTON_SX } from "./SettingsDialog";
import StorageQuotasCard from "./StorageQuotasCard";
import { usePermissions } from "@/hooks/usePermissions";

type PanelStyles = {
    fieldSx: SxProps<Theme>;
    cardSx: SxProps<Theme>;
    cardHeaderSx: SxProps<Theme>;
    actionButtonSx?: SxProps<Theme>;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};

type View = "users" | "groups" | "projects";

// A project untouched this long is a candidate to clean up or archive
const IDLE_DAYS = 90;
// While measures are pending, the panel looks again this often
const POLL_MS = 15000;

function formatWhen(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatDay(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function idleDays(lastActivity: string | null, now: number = Date.now()): number | null {
    if (!lastActivity) return null;
    const time = new Date(lastActivity).getTime();
    return Number.isNaN(time) ? null : Math.floor((now - time) / 86400000);
}

function share(part: number, whole: number): string {
    if (!whole) return "—";
    const percent = (100 * part) / whole;
    return percent > 0 && percent < 1 ? "<1 %" : `${Math.round(percent)} %`;
}

function measureState(project: ProjectStorage): { label: string; color: "default" | "info" | "warning" | "error" } {
    if (project.measuring) return { label: "Measuring", color: "info" };
    if (project.requested || !project.measuredAt) return { label: "Waiting", color: "warning" };
    if (project.error) return { label: "Not measured", color: "error" };
    return { label: formatWhen(project.measuredAt), color: "default" };
}

export default function DiskUsagePanel({ fieldSx, cardSx, cardHeaderSx, actionButtonSx, colors }: PanelStyles) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const { can } = usePermissions();
    const [report, setReport] = useState<StorageReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<View>("users");
    const [text, setText] = useState("");
    // Clicking a user shows their projects
    const [ownerId, setOwnerId] = useState<number | null>(null);

    const load = useCallback(async (quiet = false) => {
        if (!quiet) setLoading(true);
        try {
            setReport(await getStorageUsage());
            setError(null);
        } catch (e: unknown) {
            setError(e instanceof Error && e.message ? e.message : "Failed to load the disk usage");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const pending = report?.pending ?? 0;
    useEffect(() => {
        if (!pending) return;
        const timer = window.setInterval(() => void load(true), POLL_MS);
        return () => window.clearInterval(timer);
    }, [pending, load]);

    const measure = async (projectIds?: number[]) => {
        try {
            await measureStorage(projectIds);
            await load(true);
        } catch (e: unknown) {
            setError(e instanceof Error && e.message ? e.message : "Failed to ask for a new measure");
        }
    };

    const query = text.trim().toLowerCase();
    const matches = (...values: (string | null | undefined)[]) =>
        !query || values.some((value) => (value ?? "").toLowerCase().includes(query));

    const users = useMemo(() => (report?.users ?? []).filter((user) => matches(user.name, user.email)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [report, query]);
    const groups = useMemo(() => (report?.groups ?? []).filter((group) => matches(group.name)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [report, query]);
    const projects = useMemo(() => (report?.projects ?? []).filter((project) =>
            (ownerId == null || project.ownerId === ownerId)
            && matches(project.name, project.ownerName, project.ownerEmail, project.path)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [report, query, ownerId]);
    const owner = ownerId == null ? null : report?.users.find((user) => user.userId === ownerId) ?? null;

    const total = report?.total.totalBytes ?? 0;
    const disk = report?.disk ?? null;
    const cellSx = { fontSize: 14, color: colors.text, borderColor: colors.border, verticalAlign: "top" };
    const headSx = { ...cellSx, fontWeight: 800, color: colors.muted, whiteSpace: "nowrap" };
    const numberSx = { ...cellSx, textAlign: "right" as const, whiteSpace: "nowrap" };
    const noteSx = { fontSize: 13.5, color: colors.muted };

    const showProjectsOf = (userId: number) => {
        setOwnerId(userId);
        setText("");
        setView("projects");
    };

    return (
        <Stack spacing={1.75}>
            {error && <Alert severity="error">{error}</Alert>}
            <Card variant="outlined" sx={cardSx}>
                <CardHeader
                    title="Disk usage"
                    subheader={"What the projects take on the disk, by user, group and project. The API measures "
                        + "each project in the background: once a day, an hour after it changed, and when asked."}
                    sx={cardHeaderSx}
                    action={
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" sx={actionSx} startIcon={<Ruler size={15} />}
                                    onClick={() => void measure()}>
                                Measure all again
                            </Button>
                            <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                    disabled={loading} onClick={() => void load()}>
                                Reload
                            </Button>
                        </Stack>
                    }
                />
                <CardContent sx={{ pt: 2 }}>
                    {loading && !report ? (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={26} /></Box>
                    ) : report ? (
                        <Stack spacing={2.25}>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                                <Box sx={{ flex: 1, p: 1.75, border: `1px solid ${colors.border}`, borderRadius: 2 }}>
                                    <Typography sx={noteSx}>The projects</Typography>
                                    <Typography sx={{ fontSize: 22, fontWeight: 800, color: colors.text }}>
                                        {formatBytes(total)}
                                    </Typography>
                                    <Typography sx={noteSx}>
                                        {report.total.projects} projects of {report.users.length} users
                                        {report.total.measured < report.total.projects
                                            ? ` · ${report.total.projects - report.total.measured} not measured yet`
                                            : ""}
                                    </Typography>
                                </Box>
                                {disk && (
                                    <Box sx={{ flex: 2, p: 1.75, border: `1px solid ${colors.border}`, borderRadius: 2 }}>
                                        <Typography sx={noteSx}>The projects' disk ({disk.path})</Typography>
                                        <Typography sx={{ fontSize: 22, fontWeight: 800, color: colors.text }}>
                                            {formatBytes(disk.freeBytes)} free
                                            <Typography component="span" sx={{ ...noteSx, ml: 1 }}>
                                                of {formatBytes(disk.totalBytes)}
                                            </Typography>
                                        </Typography>
                                        <LinearProgress
                                            variant="determinate"
                                            value={disk.totalBytes ? (100 * disk.usedBytes) / disk.totalBytes : 0}
                                            color={disk.totalBytes && disk.freeBytes / disk.totalBytes < 0.1
                                                ? "error" : "primary"}
                                            sx={{ height: 8, borderRadius: 4, my: 1 }}
                                        />
                                        <Typography sx={noteSx}>
                                            {formatBytes(disk.usedBytes)} used, {share(total, disk.totalBytes)} of it
                                            by the projects measured
                                        </Typography>
                                    </Box>
                                )}
                            </Stack>

                            {pending > 0 && (
                                <Alert severity="info">
                                    {pending} {pending === 1 ? "project is" : "projects are"} waiting to be measured;
                                    this page updates on its own.
                                </Alert>
                            )}

                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                                <ToggleButtonGroup exclusive size="small" value={view}
                                                   onChange={(_, value) => value && setView(value)}>
                                    <ToggleButton value="users" sx={{ fontSize: 14, px: 2 }}>By user</ToggleButton>
                                    <ToggleButton value="groups" sx={{ fontSize: 14, px: 2 }}>By group</ToggleButton>
                                    <ToggleButton value="projects" sx={{ fontSize: 14, px: 2 }}>By project</ToggleButton>
                                </ToggleButtonGroup>
                                <TextField sx={[{ flex: 1 }, ...(Array.isArray(fieldSx) ? fieldSx : [fieldSx])]} size="small"
                                           label="Search" value={text}
                                           placeholder="A name, an email, a project…"
                                           onChange={(e) => setText(e.target.value)} />
                            </Stack>

                            {view === "users" && (
                                <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 2 }}>
                                    <Table size="small" aria-label="Disk usage by user">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={headSx}>User</TableCell>
                                                <TableCell sx={{ ...headSx, textAlign: "right" }}>Projects</TableCell>
                                                <TableCell sx={{ ...headSx, textAlign: "right" }}>Size</TableCell>
                                                <TableCell sx={{ ...headSx, textAlign: "right" }}>Share</TableCell>
                                                <TableCell sx={{ ...headSx, textAlign: "right" }}>Uploads</TableCell>
                                                <TableCell sx={headSx}>Last activity</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {users.map((user) => (
                                                <TableRow key={user.userId} hover sx={{ cursor: "pointer" }}
                                                          onClick={() => showProjectsOf(user.userId)}>
                                                    <TableCell sx={cellSx}>
                                                        {user.name}
                                                        {user.email && user.email !== user.name && (
                                                            <Typography sx={noteSx}>{user.email}</Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell sx={numberSx}>
                                                        {user.projects}
                                                        {user.measured < user.projects && (
                                                            <Typography sx={noteSx}>
                                                                {user.projects - user.measured} not measured
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell sx={{ ...numberSx, fontWeight: 700 }}>
                                                        {formatBytes(user.totalBytes)}
                                                    </TableCell>
                                                    <TableCell sx={numberSx}>{share(user.totalBytes, total)}</TableCell>
                                                    <TableCell sx={numberSx}>{formatBytes(user.uploadsBytes)}</TableCell>
                                                    <TableCell sx={cellSx}>{formatDay(user.lastActivity)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}

                            {view === "groups" && (
                                <Stack spacing={1}>
                                    <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 2 }}>
                                        <Table size="small" aria-label="Disk usage by group">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={headSx}>Group</TableCell>
                                                    <TableCell sx={{ ...headSx, textAlign: "right" }}>Members</TableCell>
                                                    <TableCell sx={{ ...headSx, textAlign: "right" }}>Projects</TableCell>
                                                    <TableCell sx={{ ...headSx, textAlign: "right" }}>Size</TableCell>
                                                    <TableCell sx={{ ...headSx, textAlign: "right" }}>Share</TableCell>
                                                    <TableCell sx={headSx}>Last activity</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {groups.map((group) => (
                                                    <TableRow key={group.groupId}>
                                                        <TableCell sx={cellSx}>{group.name}</TableCell>
                                                        <TableCell sx={numberSx}>{group.members}</TableCell>
                                                        <TableCell sx={numberSx}>{group.projects}</TableCell>
                                                        <TableCell sx={{ ...numberSx, fontWeight: 700 }}>
                                                            {formatBytes(group.totalBytes)}
                                                        </TableCell>
                                                        <TableCell sx={numberSx}>{share(group.totalBytes, total)}</TableCell>
                                                        <TableCell sx={cellSx}>{formatDay(group.lastActivity)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                    <Typography sx={noteSx}>
                                        A group adds up the projects its members own. A user in two groups counts in
                                        both, so the groups may add up to more than the total.
                                    </Typography>
                                </Stack>
                            )}

                            {view === "projects" && (
                                <Stack spacing={1}>
                                    {owner && (
                                        <Box>
                                            <Chip label={`Projects of ${owner.name}`} onDelete={() => setOwnerId(null)}
                                                  deleteIcon={<X size={15} />} sx={{ fontSize: 14 }} />
                                        </Box>
                                    )}
                                    <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 2 }}>
                                        <Table size="small" aria-label="Disk usage by project">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={headSx}>Project</TableCell>
                                                    <TableCell sx={headSx}>Owner</TableCell>
                                                    <TableCell sx={{ ...headSx, textAlign: "right" }}>Size</TableCell>
                                                    <TableCell sx={{ ...headSx, textAlign: "right" }}>Runs</TableCell>
                                                    <TableCell sx={{ ...headSx, textAlign: "right" }}>Uploads</TableCell>
                                                    <TableCell sx={headSx}>Last activity</TableCell>
                                                    <TableCell sx={headSx}>Measured</TableCell>
                                                    <TableCell sx={headSx} />
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {projects.map((project) => {
                                                    const state = measureState(project);
                                                    const idle = idleDays(project.lastActivity);
                                                    return (
                                                        <TableRow key={project.id}>
                                                            <TableCell sx={cellSx}>
                                                                {project.name}
                                                                <Typography sx={{ ...noteSx, wordBreak: "break-all" }}>
                                                                    {project.path}
                                                                </Typography>
                                                                {project.location && project.location !== "managed" && (
                                                                    <Typography sx={noteSx}>
                                                                        {project.location === "linked"
                                                                            ? "A link to a project elsewhere"
                                                                            : "Outside the projects folder"}
                                                                    </Typography>
                                                                )}
                                                            </TableCell>
                                                            <TableCell sx={cellSx}>{project.ownerName}</TableCell>
                                                            <TableCell sx={{ ...numberSx, fontWeight: 700 }}>
                                                                {formatBytes(project.totalBytes)}
                                                            </TableCell>
                                                            <TableCell sx={numberSx}>{formatBytes(project.runsBytes)}</TableCell>
                                                            <TableCell sx={numberSx}>
                                                                {formatBytes(project.uploadsBytes)}
                                                            </TableCell>
                                                            <TableCell sx={cellSx}>
                                                                {formatDay(project.lastActivity)}
                                                                {idle != null && idle >= IDLE_DAYS && (
                                                                    <Box sx={{ mt: 0.5 }}>
                                                                        <Chip size="small" color="warning"
                                                                              variant="outlined"
                                                                              label={`Unused for ${Math.floor(idle / 30)} months`}
                                                                              sx={{ fontSize: 13.5 }} />
                                                                    </Box>
                                                                )}
                                                            </TableCell>
                                                            <TableCell sx={cellSx}>
                                                                {state.color === "default" ? (
                                                                    <Typography sx={{ fontSize: 14 }}>{state.label}</Typography>
                                                                ) : (
                                                                    <Chip size="small" color={state.color}
                                                                          label={state.label} sx={{ fontSize: 13.5 }} />
                                                                )}
                                                                {project.error && !project.requested && (
                                                                    <Typography sx={noteSx}>{project.error}</Typography>
                                                                )}
                                                            </TableCell>
                                                            <TableCell sx={cellSx}>
                                                                <Tooltip title="Measure again">
                                                                    <span>
                                                                        <IconButton
                                                                            size="small"
                                                                            aria-label={`Measure ${project.name} again`}
                                                                            disabled={project.measuring || project.requested}
                                                                            onClick={() => void measure([project.id])}
                                                                        >
                                                                            <Ruler size={16} />
                                                                        </IconButton>
                                                                    </span>
                                                                </Tooltip>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                    <Typography sx={noteSx}>
                                        Sizes are what the folders take on the disk. Links (as imported movies usually
                                        are) are not followed, so the microscope's data is not counted.
                                    </Typography>
                                </Stack>
                            )}
                        </Stack>
                    ) : null}
                </CardContent>
            </Card>
            <StorageQuotasCard report={report} canEdit={can("settings.manage")} fieldSx={fieldSx} cardSx={cardSx}
                               cardHeaderSx={cardHeaderSx} actionButtonSx={actionSx} colors={colors} />
        </Stack>
    );
}
