import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    InputAdornment,
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
import { useTheme } from "@mui/material/styles";
import { HardDrive, RefreshCw, Ruler, Search, X } from "lucide-react";

import { formatBytes } from "@/components/projects/ProjectOverviewPanel";
import { getStorageUsage, measureStorage, type ProjectStorage, type StorageReport } from "@/api/storage";
import { choiceButtonsSx, SETTINGS_TEXT, SettingsSection, sectionTint } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";
import StorageQuotasCard from "./StorageQuotasCard";
import { usePermissions } from "@/hooks/usePermissions";

// The page may still pass its own look; the panel uses the shared Settings one
type PanelStyles = {
    fieldSx?: SxProps<Theme>;
    cardSx?: SxProps<Theme>;
    cardHeaderSx?: SxProps<Theme>;
    actionButtonSx?: SxProps<Theme>;
    colors?: { border: string; text: string; muted: string; surface: string; hover: string };
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the old look props are still accepted
export default function DiskUsagePanel(_styles: PanelStyles = {}) {
    const isDarkMode = useTheme().palette.mode === "dark";
    const { colors, fieldSx, actionButtonSx: actionSx } = useSettingsStyles(isDarkMode);
    const sectionColors = { ...colors, hover: colors.hover };
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
    const cellSx = { fontSize: SETTINGS_TEXT.control, color: colors.text, borderColor: colors.border, verticalAlign: "top" };
    const headSx = { ...cellSx, fontSize: SETTINGS_TEXT.text, fontWeight: 700, color: colors.muted, whiteSpace: "nowrap",
                     bgcolor: colors.card };
    const numberSx = { ...cellSx, textAlign: "right" as const, whiteSpace: "nowrap" };
    const noteSx = { fontSize: SETTINGS_TEXT.text, color: colors.muted };
    const statSx = { p: 2, borderRadius: 2.5, bgcolor: sectionTint(isDarkMode) };
    const tableBoxSx = { border: `1px solid ${colors.border}`, borderRadius: 2, maxHeight: { xs: 480, md: 560 },
                         overflowY: "auto" };

    const showProjectsOf = (userId: number) => {
        setOwnerId(userId);
        setText("");
        setView("projects");
    };

    return (
        <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <SettingsSection
                    icon={<HardDrive size={19} />}
                    title="Disk usage"
                    subtitle={"What the projects take on the disk, by person, group and project. Each project is "
                        + "measured in the background: once a day, an hour after it changes, and when asked."}
                    colors={sectionColors}
                    isDarkMode={isDarkMode}
                    plain
                    actions={
                        <Stack direction="row" spacing={1}>
                            <Button size="small" sx={actionSx} startIcon={<Ruler size={15} />}
                                    onClick={() => void measure()}>
                                Measure all again
                            </Button>
                            <Button size="small" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                    disabled={loading} onClick={() => void load()}>
                                Reload
                            </Button>
                        </Stack>
                    }
                >
                    {loading && !report ? (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={26} /></Box>
                    ) : report ? (
                        <Stack spacing={2.25}>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                                <Box sx={{ flex: 1, ...statSx }}>
                                    <Typography sx={noteSx}>The projects</Typography>
                                    <Typography sx={{ fontSize: 24, fontWeight: 800, color: colors.text, lineHeight: 1.3 }}>
                                        {formatBytes(total)}
                                    </Typography>
                                    <Typography sx={noteSx}>
                                        {report.total.projects} projects of {report.users.length} people
                                        {report.total.measured < report.total.projects
                                            ? ` · ${report.total.projects - report.total.measured} not measured yet`
                                            : ""}
                                    </Typography>
                                </Box>
                                {disk && (
                                    <Box sx={{ flex: 2, ...statSx }}>
                                        <Typography sx={noteSx}>The projects' disk ({disk.path})</Typography>
                                        <Typography sx={{ fontSize: 24, fontWeight: 800, color: colors.text, lineHeight: 1.3 }}>
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
                                <ToggleButtonGroup exclusive size="small" value={view} aria-label="Disk usage by"
                                                   onChange={(_, value) => value && setView(value)}
                                                   sx={choiceButtonsSx(sectionColors, isDarkMode)}>
                                    <ToggleButton value="users">By user</ToggleButton>
                                    <ToggleButton value="groups">By group</ToggleButton>
                                    <ToggleButton value="projects">By project</ToggleButton>
                                </ToggleButtonGroup>
                                <TextField sx={{ ...fieldSx, flex: 1 }} size="small"
                                           label="Search" value={text}
                                           placeholder="A name, an email, a project…"
                                           onChange={(e) => setText(e.target.value)}
                                           InputProps={{ startAdornment: (
                                               <InputAdornment position="start"><Search size={16} /></InputAdornment>
                                           ) }} />
                            </Stack>

                            {view === "users" && (
                                <TableContainer sx={tableBoxSx}>
                                    <Table size="small" stickyHeader aria-label="Disk usage by user">
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
                                    <TableContainer sx={tableBoxSx}>
                                        <Table size="small" stickyHeader aria-label="Disk usage by group">
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
                                    <TableContainer sx={tableBoxSx}>
                                        <Table size="small" stickyHeader aria-label="Disk usage by project">
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
                                                                    <Typography sx={{ fontSize: SETTINGS_TEXT.control }}>{state.label}</Typography>
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
            </SettingsSection>
            <StorageQuotasCard report={report} canEdit={can("settings.manage")} />
        </Stack>
    );
}
