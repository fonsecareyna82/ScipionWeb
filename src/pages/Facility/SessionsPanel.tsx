import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link as RouterLink } from "react-router";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    CircularProgress,
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
    ListSubheader,
    MenuItem,
    Select,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    Activity, AlertTriangle, Ban, CalendarClock, ChevronDown, ChevronRight, Folder, CalendarDays, Copy, FolderOpen, Image as ImageIcon, Layers, LayoutGrid, MessageSquare,
    Microscope as MicroscopeIcon, Pencil, Play, Plus, RefreshCw, RotateCw, Search, Square, StickyNote, Ticket, Trash2, UserRound,
    UsersRound, Workflow,
} from "lucide-react";
import toast from "react-hot-toast";

import SettingsDialog, { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import { listGroupNames } from "@/api/access";
import { loadCurrentUserOnce } from "@/api/auth";
import { fetchWorkflows, listUsers } from "@/api/projects";
import {
    addSessionImage,
    createSession,
    deleteFacilityImage,
    deleteSession,
    getFacilitySettings,
    listMicroscopes,
    listSamples,
    listSessions,
    processSessionDataset,
    rereadDatasetAcquisition,
    sessionPayloadOf,
    updateSession,
    type DatasetWatch,
    type FacilityImage,
    type FacilitySession,
    type Microscope,
    type Sample,
    type SessionDataset,
    type SessionFilter,
    type SessionPayload,
    type SessionStatus,
    type SessionTechnique,
} from "@/api/facility";
import { FACILITY_TEXT, useFacilityStyles } from "./facilityStyles";
import { SettingsSection, choiceButtonsSx, sectionTint } from "@/pages/Settings/SettingsSection";
import { useIsDark } from "@/context/ThemeContext";
import ImageStrip from "./ImageStrip";
import NavigationReport from "./NavigationReport";

type PanelStyles = {
    fieldSx: any;
    cardSx: any;
    cardHeaderSx: any;
    selectSx: any;
    menuPaperSx: any;
    actionButtonSx?: any;
    saveButtonSx?: any;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};

type Person = { id: number; email: string; firstName?: string | null; lastName?: string | null };
type Named = { id: number; name: string };

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
    planned: "Planned",
    acquiring: "Acquiring",
    finished: "Finished",
    archived: "Archived",
};

export const SESSION_STATUS_COLORS: Record<SessionStatus, string> = {
    planned: "#64748b",
    acquiring: "#16a34a",
    finished: "#2563eb",
    archived: "#a16207",
};

const TECHNIQUE_LABELS: Record<SessionTechnique, string> = { spa: "SPA", tomo: "Tomography" };

const FILTER_LABELS: Record<SessionFilter, string> = {
    active: "Planned and acquiring",
    all: "All sessions",
    planned: "Planned",
    acquiring: "Acquiring",
    finished: "Finished",
    archived: "Archived",
};

// A microscope's autoloader positions: a session's DATA are 1 to its gridSlots
function positionsOf(slots: number | undefined): number[] {
    return Array.from({ length: Math.max(1, slots ?? 12) }, (_, index) => index + 1);
}
const FILTER_ORDER: SessionFilter[] = ["active", "acquiring", "planned", "finished", "archived", "all"];

const SEARCH_DELAY_MS = 300;
// While a session acquires, the list follows its folders: the watcher looks at them every 30 s
const ACQUIRING_REFRESH_MS = 30000;

const WATCH_LABELS: Record<DatasetWatch, string> = {
    receiving: "Receiving",
    stalled: "No new movies",
    acquired: "Acquired",
    idle: "",
    noOffload: "No offload folder",
    pending: "Looking…",
    noFolder: "Folder not made yet",
    waiting: "Waiting for movies",
    atlasFound: "Atlas there",
};

const WATCH_COLORS: Record<DatasetWatch, string> = {
    receiving: "#16a34a",
    stalled: "#d97706",
    acquired: "#64748b",
    idle: "#64748b",
    noOffload: "#dc2626",
    pending: "#64748b",
    noFolder: "#64748b",
    waiting: "#2563eb",
    atlasFound: "#16a34a",
};

function formatBytes(bytes: number): string {
    if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function since(value: string | null | undefined): string {
    if (!value) return "";
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (!Number.isFinite(minutes)) return "";
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function round(value: number | null | undefined, digits: number): string {
    return value == null ? "" : String(Number(value.toFixed(digits)));
}

/** What a DATA's movies and its first movie's metadata say, in one line. */
export function describeAcquisition(dataset: SessionDataset): string {
    const acquisition = dataset.acquisition;
    const parts: string[] = [];
    if (dataset.kind === "atlas") {
        // Its files, not movies
        const atlas = dataset.atlas;
        if (!atlas?.files) return "";
        parts.push(`${atlas.files} file${atlas.files === 1 ? "" : "s"}`);
        if (atlas.bytes) parts.push(formatBytes(atlas.bytes));
        if (atlas.newestAt) parts.push(`last change ${since(atlas.newestAt)}`);
        return parts.join(" · ");
    }
    if (dataset.movieCount) {
        parts.push(`${dataset.movieCount} movie${dataset.movieCount === 1 ? "" : "s"}`);
        if (dataset.movieBytes) parts.push(formatBytes(dataset.movieBytes));
    }
    if (acquisition && !acquisition.error) {
        if (acquisition.pixelSize != null) parts.push(`${round(acquisition.pixelSize, 3)} Å${acquisition.pixelCalibrated ? " (calibrated)" : ""}`);
        if (acquisition.magnification != null) parts.push(`${acquisition.magnification.toLocaleString("en-US")}×`);
        if (acquisition.totalDose != null) parts.push(`${round(acquisition.totalDose, 1)} e⁻/Å²`);
        else if (acquisition.cameraDose != null) parts.push(`${round(acquisition.cameraDose, 1)} e⁻/Å² at the camera`);
        if (acquisition.frames != null) parts.push(`${acquisition.frames} frames`);
    }
    if (dataset.lastMovieAt) parts.push(`last ${since(dataset.lastMovieAt)}`);
    return parts.join(" · ");
}

function personName(person: Person | null | undefined, fallback = ""): string {
    if (!person) return fallback;
    const name = `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim();
    return name || person.email;
}

function formatDate(value: string | null | undefined): string {
    if (!value) return "";
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Copy text: the microscope PCs open the web over plain http, where navigator.clipboard is missing. */
async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand("copy");
    } finally {
        document.body.removeChild(textarea);
    }
}

function copyFolders(text: string, what: string) {
    copyText(text).then(() => toast.success(`${what} copied.`)).catch(() => toast.error("The browser did not let it copy."));
}

/** The grid of a dataset in words: sample, box, position, grid number and specimen. */
export function describeDatasetGrid(dataset: Pick<SessionDataset, "grid">): string {
    const grid = dataset.grid;
    if (!grid) return "";
    return [grid.sampleCode, `box ${grid.boxLabel}`, `position ${grid.position}`,
        grid.gridNumber != null ? `grid #${grid.gridNumber}` : "", grid.specimen].filter(Boolean).join(" · ");
}

// A grid that a DATA can point to, from the samples
type GridOption = { id: number; sampleCode: string; label: string };

function gridOptionsOf(samples: Sample[]): GridOption[] {
    return samples.flatMap((sample) => sample.boxes.flatMap((box) => box.grids.filter((grid) => grid.id != null).map((grid) => ({
        id: grid.id as number,
        sampleCode: sample.code,
        label: [sample.code, `box ${box.label}`, `position ${grid.position}`,
            grid.gridNumber != null ? `grid #${grid.gridNumber}` : "", grid.gridType, grid.specimen].filter(Boolean).join(" · "),
    }))));
}

/** The folders of a session, each with a copy button: what the operator types into EPU. */
/** A session's state as a coloured pill. */
export function SessionStatusPill({ status }: { status: SessionStatus }) {
    const color = SESSION_STATUS_COLORS[status];
    return (
        <Box component="span" sx={{ px: 1, borderRadius: 10, flexShrink: 0, lineHeight: 1.7, fontSize: FACILITY_TEXT.badge,
                                    fontWeight: 700, color, bgcolor: `${color}1f` }}>
            {SESSION_STATUS_LABELS[status]}
        </Box>
    );
}

export type SessionFact = { icon: ReactNode; text: string };

/** What a session is (microscope, technique, day, people, booking…), each with its icon. */
export function SessionFacts({ facts, colors }: { facts: SessionFact[]; colors: { muted: string; text: string } }) {
    return (
        <Stack direction="row" useFlexGap flexWrap="wrap" columnGap={2} rowGap={0.5} aria-label="About the session">
            {facts.filter((fact) => fact.text).map((fact) => (
                <Stack key={fact.text} direction="row" spacing={0.6} alignItems="center" sx={{ color: colors.muted, minWidth: 0 }}>
                    {fact.icon}
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text }}>{fact.text}</Typography>
                </Stack>
            ))}
        </Stack>
    );
}

/** The card of a session: a band of its state's colour on the left, and its parts one under the other. */
export function sessionCardSx(status: SessionStatus, colors: { border: string }, card: string) {
    return { border: `1px solid ${colors.border}`, borderLeft: `4px solid ${SESSION_STATUS_COLORS[status]}`, borderRadius: 2.5,
             bgcolor: card, overflow: "hidden" } as const;
}

function SessionFolders({ session, colors, onProcess, onReread }: {
    session: FacilitySession;
    colors: PanelStyles["colors"];
    // Ask for a DATA's project (again); absent for those who only watch
    onProcess?: (dataset: SessionDataset) => void;
    // Read a DATA's first movie again (after fixing a detector); absent for those who only watch
    onReread?: (dataset: SessionDataset) => void;
}) {
    return (
        <Box sx={{ borderTop: `1px solid ${colors.border}`, bgcolor: colors.hover, px: 2, py: 1 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.25 }}>
                <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 800, color: colors.muted, textTransform: "uppercase",
                                  letterSpacing: 0.5 }}>
                    Folders for the microscope
                </Typography>
                <Button size="small" variant="text" startIcon={<Copy size={14} />}
                        sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note }}
                        onClick={() => copyFolders(session.datasets.map((dataset) => dataset.folder).join("\n"), "Folder names")}>
                    Copy all
                </Button>
            </Stack>
            <Stack spacing={0.5}>
                {session.datasets.map((dataset) => (
                    <Box key={dataset.id} sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                        <Tooltip arrow title="Copy this folder's name">
                            <IconButton size="small" aria-label={`Copy ${dataset.folder}`}
                                        onClick={() => copyFolders(dataset.folder, dataset.folder)}>
                                <Copy size={14} />
                            </IconButton>
                        </Tooltip>
                        <Typography sx={{ fontFamily: "monospace", fontSize: FACILITY_TEXT.itemLine, color: colors.text, flexShrink: 0 }}>
                            {dataset.folder}
                        </Typography>
                        <Typography noWrap sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted, minWidth: 0 }}>
                            {dataset.kind === "atlas" ? "the grids' atlas" : describeDatasetGrid(dataset) || "no grid yet"}
                            {dataset.detectorName ? ` · ${dataset.detectorName}` : ""}
                        </Typography>
                    </Stack>
                    {/* Under its folder, what came in and how its processing goes: a line of its own, so it is not cut */}
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, pl: 4.5, flexWrap: "wrap", rowGap: 0.5 }}>
                        <DatasetProgress dataset={dataset} colors={colors} />
                        {onReread && dataset.kind === "data" && dataset.acquisition && (
                            <Tooltip arrow title="Read its first movie's metadata again: after fixing a detector's name in the metadata or its calibration. A project already made keeps what it was made with.">
                                <Button size="small" variant="outlined" startIcon={<RotateCw size={13} />}
                                        sx={{ ...DATASET_BUTTON_SX, color: colors.text, borderColor: colors.border }}
                                        aria-label={`Read the first movie of ${dataset.folder} again`}
                                        onClick={() => onReread(dataset)}>
                                    Read again
                                </Button>
                            </Tooltip>
                        )}
                        <DatasetProcessing session={session} dataset={dataset} colors={colors} onProcess={onProcess} />
                        {dataset.navigation && <NavigationReport dataset={dataset} canMake={!!onProcess} />}
                    </Stack>
                    </Box>
                ))}
            </Stack>
        </Box>
    );
}

/** Where a DATA's acquisition is: its state, and what its movies say. */
export function DatasetProgress({ dataset, colors }: { dataset: SessionDataset; colors: PanelStyles["colors"] }) {
    const watch = dataset.watch;
    if (!watch || (watch === "idle" && !dataset.movieCount)) return null;
    const acquisition = dataset.acquisition;
    const notes = [
        acquisition?.error ? `The metadata of ${acquisition.metadataFile} could not be read: ${acquisition.error}` : "",
        acquisition?.cameraName ? `Camera ${acquisition.cameraName}${acquisition.detectorName ? "" : " (no detector of the microscope has this name in the metadata)"}` : "",
        acquisition?.nominalPixelSize != null && acquisition.pixelCalibrated ? `EPU's nominal pixel ${round(acquisition.nominalPixelSize, 4)} Å` : "",
        acquisition?.dosePerFrame != null ? `${round(acquisition.dosePerFrame, 3)} e⁻/Å² per frame` : "",
        acquisition?.voltageKv != null ? `${acquisition.voltageKv} kV` : "",
        acquisition?.gainFile ? `Gain ${acquisition.gainFile}` : "",
        ...(acquisition?.warnings ?? []),
    ].filter(Boolean);
    const line = describeAcquisition(dataset);
    const label = WATCH_LABELS[watch];
    return (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, flexWrap: "wrap", rowGap: 0.5 }}>
            {line && (
                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, minWidth: 0 }}>{line}</Typography>
            )}
            {label && (
                <Tooltip arrow title={notes.length ? <Box sx={{ whiteSpace: "pre-line" }}>{notes.join("\n")}</Box> : ""}>
                    <Box sx={{ px: 0.8, py: 0.1, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", gap: 0.4,
                               border: `1px solid ${WATCH_COLORS[watch]}`, color: WATCH_COLORS[watch] }}>
                        {(watch === "stalled" || watch === "noOffload" || acquisition?.error || (acquisition?.warnings?.length ?? 0) > 0) && (
                            <AlertTriangle size={12} />
                        )}
                        <Typography sx={{ fontSize: FACILITY_TEXT.badge, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</Typography>
                    </Box>
                </Tooltip>
            )}
        </Stack>
    );
}

const PROCESSING_LABELS = { queued: "Queued", running: "Making its project…", launched: "Processing", error: "Processing failed",
    gone: "Project deleted" };
const PROCESSING_COLORS = { queued: "#64748b", running: "#2563eb", launched: "#16a34a", error: "#dc2626", gone: "#64748b" };

// What can be clicked on a DATA has a border: without one it reads as a label
const DATASET_BUTTON_SX = { textTransform: "none", fontSize: FACILITY_TEXT.note, borderRadius: 2, py: 0.1, px: 1,
    minWidth: 0, lineHeight: 1.6, whiteSpace: "nowrap" } as const;

/** Open a DATA's project, or its streaming monitor. */
export function DatasetProjectLinks({ dataset, colors, readOnly = false }: {
    dataset: { projectId?: number | null; folder: string };
    colors: { text: string; border: string };
    readOnly?: boolean;
}) {
    if (dataset.projectId == null) return null;
    const sx = { ...DATASET_BUTTON_SX, color: colors.text, borderColor: colors.border };
    return (
        <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
            <Tooltip arrow title={readOnly ? "Open its project (read only)" : "Open its project"}>
                <Button size="small" variant="outlined" sx={sx} component={RouterLink} to={`/project/load/${dataset.projectId}`}
                        startIcon={<FolderOpen size={14} />} aria-label={`Open the project of ${dataset.folder}`}>
                    Project
                </Button>
            </Tooltip>
            <Tooltip arrow title="Its streaming monitor">
                <Button size="small" variant="outlined" sx={sx} component={RouterLink} to={`/project/${dataset.projectId}/monitor`}
                        startIcon={<Activity size={14} />} aria-label={`Monitor of ${dataset.folder}`}>
                    Monitor
                </Button>
            </Tooltip>
        </Stack>
    );
}

/** A DATA's project: how its making went, links to it and its monitor, and asking for it (again). */
function DatasetProcessing({ session, dataset, colors, onProcess }: {
    session: FacilitySession;
    dataset: SessionDataset;
    colors: PanelStyles["colors"];
    onProcess?: (dataset: SessionDataset) => void;
}) {
    if (dataset.kind !== "data") return null;
    // Launched, but its project was deleted since: it is not processing any more
    const processing = dataset.processing?.state === "launched" && dataset.projectId == null
        ? { ...dataset.processing, state: "gone" as const, message: "Its project was deleted: process it again to make a new one." }
        : dataset.processing;
    const canAsk = !!onProcess && !dataset.projectId && session.status === "acquiring" && !!session.templateId
        && !!dataset.acquisition && !dataset.acquisition.error && processing?.state !== "queued" && processing?.state !== "running";
    // Without a template, or before its first movie, a DATA has nothing to process
    if (!processing && !dataset.projectId && !canAsk) return null;
    const tooltip = [processing?.message, processing?.note, processing?.templateId && `Template ${processing.templateId}`]
        .filter(Boolean).join("\n");
    return (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
            {processing && (
                <Tooltip arrow title={tooltip ? <Box sx={{ whiteSpace: "pre-line" }}>{tooltip}</Box> : ""}>
                    <Box sx={{ px: 0.8, py: 0.1, borderRadius: 10, display: "flex", alignItems: "center", gap: 0.4,
                               border: `1px solid ${PROCESSING_COLORS[processing.state]}`, color: PROCESSING_COLORS[processing.state] }}>
                        {processing.state === "error" && <AlertTriangle size={12} />}
                        <Typography sx={{ fontSize: FACILITY_TEXT.badge, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {PROCESSING_LABELS[processing.state]}
                        </Typography>
                    </Box>
                </Tooltip>
            )}
            {dataset.projectId != null && <DatasetProjectLinks dataset={dataset} colors={colors} />}
            {canAsk && (
                <Button size="small" variant="outlined" sx={{ ...DATASET_BUTTON_SX, color: colors.text, borderColor: colors.border }}
                        onClick={() => onProcess?.(dataset)}>
                    {processing?.state === "error" ? "Try again" : "Process now"}
                </Button>
            )}
        </Stack>
    );
}

export default function SessionsPanel({ fieldSx, selectSx, menuPaperSx, colors, actionButtonSx,
                                        saveButtonSx, canEdit }: PanelStyles & { canEdit: boolean }) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = saveButtonSx ?? ROUNDED_BUTTON_SX;
    const isDark = useIsDark();
    // The look of the Settings sections (card colour, the accent of the icons)
    const sectionColors = { ...useFacilityStyles().colors, ...colors };
    const [sessions, setSessions] = useState<FacilitySession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<SessionFilter>("active");
    const [search, setSearch] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [editing, setEditing] = useState<FacilitySession | "new" | null>(null);
    const [deleting, setDeleting] = useState<FacilitySession | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setAppliedSearch(search.trim()), SEARCH_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setSessions(await listSessions(filter, appliedSearch));
        } catch (e: any) {
            setError(String(e?.message || "Failed to load the sessions"));
        } finally {
            setLoading(false);
        }
    }, [filter, appliedSearch]);

    useEffect(() => {
        void load();
    }, [load]);

    // A session acquiring: its folders change, so the list follows them (quietly, without the spinner)
    const acquiring = sessions.some((session) => session.status === "acquiring");
    useEffect(() => {
        if (!acquiring || editing !== null) return;
        const timer = window.setInterval(() => {
            listSessions(filter, appliedSearch).then(setSessions).catch(() => undefined);
        }, ACQUIRING_REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [acquiring, editing, filter, appliedSearch]);

    const setStatus = useCallback(async (session: FacilitySession, status: SessionStatus) => {
        setBusy(true);
        try {
            await updateSession(session.id, { ...sessionPayloadOf(session), status });
            toast.success(`${session.name}: ${SESSION_STATUS_LABELS[status].toLowerCase()}.`);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the session"));
        } finally {
            setBusy(false);
        }
    }, [load]);

    const process = useCallback(async (dataset: SessionDataset) => {
        try {
            await processSessionDataset(dataset.id);
            toast.success(`${dataset.folder}: its project is made at the watcher's next look.`);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to ask for the project"));
        }
    }, [load]);

    const reread = useCallback(async (dataset: SessionDataset) => {
        try {
            await rereadDatasetAcquisition(dataset.id);
            toast.success(`${dataset.folder}: its first movie was read again.`);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to read the first movie again"));
        }
    }, [load]);

    const remove = useCallback(async (session: FacilitySession) => {
        setBusy(true);
        try {
            await deleteSession(session.id);
            toast.success("Session deleted.");
            setDeleting(null);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to delete the session"));
        } finally {
            setBusy(false);
        }
    }, [load]);

    return (
        <Stack spacing={2}>
            <SettingsSection
                plain
                icon={<CalendarClock size={19} />}
                title="Sessions"
                subtitle="Each stay on a microscope: who it is for, its booking, and the folders the microscope writes, an ATLAS and a DATA per grid."
                colors={sectionColors}
                isDarkMode={isDark}
                actions={
                    <Stack direction="row" spacing={1}>
                        <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                disabled={loading} onClick={() => void load()}>
                            Reload
                        </Button>
                        {canEdit && (
                            <Button size="small" variant="contained" sx={saveSx} startIcon={<Plus size={15} />}
                                    onClick={() => setEditing("new")}>
                                New session
                            </Button>
                        )}
                    </Stack>
                }
            >
                <Stack spacing={1.5}>
                    {error && <Alert severity="error">{error}</Alert>}
                    <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} alignItems={{ lg: "center" }}
                           justifyContent="space-between">
                        <ToggleButtonGroup exclusive size="small" value={filter} aria-label="Sessions shown"
                                           onChange={(_, value) => value && setFilter(value as SessionFilter)}
                                           sx={choiceButtonsSx({ ...sectionColors, hover: colors.hover }, isDark)}>
                            {FILTER_ORDER.map((value) => (
                                <ToggleButton key={value} value={value}>{FILTER_LABELS[value]}</ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <TextField sx={{ ...fieldSx, width: { xs: "100%", lg: 340 } }} size="small"
                                   placeholder="Search by name, booking, user or group"
                                   value={search} onChange={(e) => setSearch(e.target.value)}
                                   inputProps={{ "aria-label": "Search sessions" }}
                                   InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
                    </Stack>
                    {loading && sessions.length === 0 && (
                        <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>
                    )}
                    {!loading && sessions.length === 0 && (
                        <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 3, textAlign: "center" }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                                {appliedSearch || filter !== "active" ? "No session matches." : "No sessions planned or under way."}
                            </Typography>
                            {canEdit && !appliedSearch && filter === "active" && (
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.5 }}>
                                    Plan one with New session: its folders are ready before the user reaches the microscope.
                                </Typography>
                            )}
                        </Box>
                    )}
                    {sessions.map((session) => {
                        const facts: SessionFact[] = [
                            { icon: <MicroscopeIcon size={15} />, text: session.microscopeName ?? "" },
                            { icon: <Layers size={15} />, text: TECHNIQUE_LABELS[session.technique] },
                            { icon: <CalendarDays size={15} />, text: formatDate(session.scheduledOn) },
                            { icon: <UserRound size={15} />, text: session.userName || session.userEmail || "" },
                            { icon: <UsersRound size={15} />, text: session.groupName ? `group ${session.groupName}` : "" },
                            { icon: <Ticket size={15} />, text: session.bookingRef ? `booking ${session.bookingRef}` : "" },
                            {
                                icon: <Workflow size={15} />,
                                text: session.templateId
                                    ? `template ${session.templateId}${session.autoProcess ? "" : " (by hand)"}${session.oneProject ? ", one project" : ""}`
                                    : "no processing template",
                            },
                        ];
                        return (
                            <Box key={session.id} data-testid={`session-${session.id}`}
                                 sx={sessionCardSx(session.status, colors, sectionColors.card)}>
                                <Box sx={{ px: 2, pt: 1.5, pb: 1.25 }}>
                                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} alignItems={{ sm: "flex-start" }}
                                           justifyContent="space-between">
                                        <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                                                <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle + 0.5, fontWeight: 800, color: colors.text,
                                                                  fontFamily: "monospace", wordBreak: "break-all" }}>
                                                    {session.name}
                                                </Typography>
                                                <SessionStatusPill status={session.status} />
                                            </Stack>
                                            <SessionFacts facts={facts} colors={colors} />
                                            {(session.images?.length ?? 0) > 0 && (
                                                <Box sx={{ pt: 0.25 }}><ImageStrip images={session.images ?? []} size={56} colors={colors} /></Box>
                                            )}
                                        </Stack>
                                        {canEdit && (
                                            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                                {session.status === "planned" && (
                                                    <Button size="small" variant="contained" sx={saveSx} startIcon={<Play size={14} />}
                                                            disabled={busy} onClick={() => void setStatus(session, "acquiring")}>
                                                        Start
                                                    </Button>
                                                )}
                                                {session.status === "acquiring" && (
                                                    <Button size="small" variant="outlined" sx={actionSx} startIcon={<Square size={13} />}
                                                            disabled={busy} onClick={() => void setStatus(session, "finished")}>
                                                        Finish
                                                    </Button>
                                                )}
                                                <Button size="small" variant="outlined" sx={actionSx} startIcon={<Pencil size={14} />}
                                                        onClick={() => setEditing(session)}>
                                                    Edit
                                                </Button>
                                                {session.status === "planned" && (
                                                    <Tooltip arrow title="Delete">
                                                        <IconButton size="small" aria-label="Delete" sx={{ color: "#dc2626" }}
                                                                    onClick={() => setDeleting(session)}>
                                                            <Trash2 size={17} />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        )}
                                    </Stack>
                                </Box>
                                <SessionFolders session={session} colors={colors}
                                                onProcess={canEdit ? (dataset) => void process(dataset) : undefined}
                                                onReread={canEdit ? (dataset) => void reread(dataset) : undefined} />
                            </Box>
                        );
                    })}
                </Stack>
            </SettingsSection>

            {deleting !== null && (
                <SettingsDialog
                    title="Delete session?"
                    description="Only a planned session can be deleted; once it acquires, it is history: archive it instead."
                    icon={<Trash2 size={20} color="#fca5a5" />}
                    confirmLabel="Delete"
                    busyLabel="Deleting…"
                    busy={busy}
                    destructive
                    maxWidth="xs"
                    actionButtonSx={actionSx}
                    onConfirm={() => void remove(deleting)}
                    onClose={() => setDeleting(null)}
                >
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontFamily: "monospace" }}>{deleting.name}</Typography>
                </SettingsDialog>
            )}

            {editing !== null && (
                <SessionDialog
                    session={editing === "new" ? null : editing}
                    colors={colors}
                    fieldSx={fieldSx}
                    selectSx={selectSx}
                    menuPaperSx={menuPaperSx}
                    actionButtonSx={actionSx}
                    saveButtonSx={saveSx}
                    onClose={() => {
                        // Images are kept at once in the dialog: the list shows them after it
                        setEditing(null);
                        void load();
                    }}
                    onSaved={() => {
                        setEditing(null);
                        void load();
                    }}
                />
            )}
        </Stack>
    );
}

// A DATA row while edited; id null until it is saved
type DataRow = { key: number; id: number | null; number: number; gridId: number | null; detectorId: number | null; notes: string };

let rowKey = 0;
const nextKey = () => ++rowKey;

/** A part of the session dialog: an icon, its title and one line, and its fields under them. */
function DialogPart({ icon, title, subtitle, action, tint, colors, children }: {
    icon: ReactNode;
    title: string;
    subtitle?: string;
    action?: ReactNode;
    tint: string;
    colors: PanelStyles["colors"];
    children?: ReactNode;
}) {
    return (
        <Box component="section" aria-label={title} sx={{ border: `1px solid ${colors.border}`, borderRadius: 2.5, p: 2 }}>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: children ? 2 : 0 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: 1.75, flexShrink: 0, display: "grid", placeItems: "center",
                           bgcolor: tint, color: "primary.main" }}>
                    {icon}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle + 0.5, fontWeight: 800, color: colors.text, lineHeight: 1.3 }}>
                        {title}
                    </Typography>
                    {subtitle && (
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, lineHeight: 1.4 }}>{subtitle}</Typography>
                    )}
                </Box>
                {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
            </Stack>
            {children && <Stack spacing={2}>{children}</Stack>}
        </Box>
    );
}

/** An on/off option: what it does on the left, its switch on the right. */
function OptionRow({ title, description, checked, onChange, colors }: {
    title: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    colors: PanelStyles["colors"];
}) {
    return (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ py: 1.25, "& + &": { borderTop: `1px solid ${colors.border}` } }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text }}>{title}</Typography>
                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>{description}</Typography>
            </Box>
            <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} slotProps={{ input: { "aria-label": title } }} />
        </Stack>
    );
}

function dataRowsOf(session: FacilitySession | null): DataRow[] {
    if (!session) return [{ key: nextKey(), id: null, number: 1, gridId: null, detectorId: null, notes: "" }];
    return session.datasets.filter((dataset) => dataset.kind === "data").map((dataset) => ({
        key: nextKey(), id: dataset.id, number: dataset.number, gridId: dataset.gridId, detectorId: dataset.detectorId,
        notes: dataset.notes,
    }));
}

function SessionDialog({ session, colors, fieldSx, selectSx, menuPaperSx, actionButtonSx, saveButtonSx, onClose, onSaved }: {
    session: FacilitySession | null;
    colors: PanelStyles["colors"];
    fieldSx: any;
    selectSx: any;
    menuPaperSx: any;
    actionButtonSx: any;
    saveButtonSx: any;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState(session?.name ?? "");
    const [microscopeId, setMicroscopeId] = useState<number | "">(session?.microscopeId ?? "");
    const [technique, setTechnique] = useState<SessionTechnique>(session?.technique ?? "spa");
    const [status, setStatus] = useState<SessionStatus>(session?.status ?? "planned");
    const [scheduledOn, setScheduledOn] = useState(session?.scheduledOn ? session.scheduledOn.slice(0, 10) : today());
    const [userId, setUserId] = useState<number | "">(session?.userId ?? "");
    const [groupId, setGroupId] = useState<number | "">(session?.groupId ?? "");
    const [bookingRef, setBookingRef] = useState(session?.bookingRef ?? "");
    const [notes, setNotes] = useState(session?.notes ?? "");
    const [userNotes, setUserNotes] = useState(session?.userNotes ?? "");
    const [templateId, setTemplateId] = useState(session?.templateId ?? "");
    const [autoProcess, setAutoProcess] = useState(session?.autoProcess ?? true);
    const [oneProject, setOneProject] = useState(session?.oneProject ?? false);
    // Text, so a half-typed number stays as typed; empty keeps the template's limit
    const numberText = (value: number | null | undefined) => (value == null ? "" : String(value));
    const [ctfMinDefocus, setCtfMinDefocus] = useState(numberText(session?.ctfMinDefocus));
    const [ctfMaxDefocus, setCtfMaxDefocus] = useState(numberText(session?.ctfMaxDefocus));
    const [ctfMaxResolution, setCtfMaxResolution] = useState(numberText(session?.ctfMaxResolution));
    const [templates, setTemplates] = useState<{ id: string; name: string; source?: string; canLoad?: boolean; disabledReason?: string }[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(true);
    const [rows, setRows] = useState<DataRow[]>(() => dataRowsOf(session));
    // The session as the server last answered: its images change at once, not on Save
    const [current, setCurrent] = useState<FacilitySession | null>(session);
    const [microscopes, setMicroscopes] = useState<Microscope[]>([]);
    const [gridOptions, setGridOptions] = useState<GridOption[]>([]);
    const [groups, setGroups] = useState<Named[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [saving, setSaving] = useState(false);
    // The grids whose note field is open (a grid with a note always shows it)
    const [notesOpen, setNotesOpen] = useState<Set<number>>(new Set());
    // The branches of the template list closed by hand (all start open)
    const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
    const isDark = useIsDark();
    const primary = useFacilityStyles().colors.primary;

    useEffect(() => {
        let cancelled = false;
        void Promise.all([
            listMicroscopes().catch(() => [] as Microscope[]),
            listSamples().catch(() => [] as Sample[]),
            listGroupNames().catch(() => [] as Named[]),
            listUsers().catch(() => [] as Person[]),
            loadCurrentUserOnce().catch(() => null),
        ]).then(([loadedMicroscopes, loadedSamples, loadedGroups, loadedUsers, me]) => {
            if (cancelled) return;
            setMicroscopes(loadedMicroscopes);
            setGridOptions(gridOptionsOf(loadedSamples));
            setGroups(loadedGroups);
            const everyone = [...(me ? [me as Person] : []), ...(loadedUsers as Person[])];
            setPeople(everyone.filter((person, index) => everyone.findIndex((other) => other.id === person.id) === index));
            // A new session goes to the only microscope that runs sessions, when there is one
            if (!session) {
                const running = loadedMicroscopes.filter((microscope) => microscope.sessionsEnabled);
                if (running.length === 1) setMicroscopeId(running[0].id);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [session]);

    // A new session starts with the facility's CTF limits
    useEffect(() => {
        if (session) return;
        let cancelled = false;
        getFacilitySettings()
            .then(({ settings }) => {
                if (cancelled) return;
                setCtfMinDefocus(numberText(settings.ctfMinDefocus));
                setCtfMaxDefocus(numberText(settings.ctfMaxDefocus));
                setCtfMaxResolution(numberText(settings.ctfMaxResolution));
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);

    // The templates of the Workflows page (local and WorkflowHub): listing them asks WorkflowHub, so apart
    useEffect(() => {
        let cancelled = false;
        fetchWorkflows()
            .then((list: any[]) => !cancelled && setTemplates(list.map((item) => ({
                id: String(item.id), name: String(item.name ?? item.id), source: item.source, canLoad: item.canLoad,
                disabledReason: item.disabledReason,
            }))))
            .catch(() => undefined)
            .finally(() => !cancelled && setTemplatesLoading(false));
        return () => {
            cancelled = true;
        };
    }, []);

    const microscope = microscopes.find((candidate) => candidate.id === microscopeId);
    const positions = positionsOf(microscope?.gridSlots);
    // The workflows to choose from, by where they come from; "None" first, and the session's own if it is gone
    const templateOptions = useMemo(() => {
        const sourceName = (source?: string) => (source === "WH" ? "WorkflowHub" : source ? source : "This server");
        const listed = templates.map((item) => ({ ...item, group: sourceName(item.source) }))
            .sort((x, y) => x.group.localeCompare(y.group));
        const missing = templateId && !templatesLoading && !templates.some((item) => item.id === templateId)
            ? [{ id: templateId, name: templateId, group: "Chosen before", canLoad: true as boolean | undefined, disabledReason: undefined as string | undefined }]
            : [];
        return [{ id: "", name: "None: no project is made", group: "", canLoad: true as boolean | undefined, disabledReason: undefined as string | undefined },
                ...missing, ...listed];
    }, [templates, templateId, templatesLoading]);
    const nameFixed = !!session && session.status !== "planned";
    const gridLabel = useMemo(() => new Map(gridOptions.map((option) => [option.id, option])), [gridOptions]);
    const datasetById = useMemo(() => new Map((current?.datasets ?? []).map((dataset) => [dataset.id, dataset])), [current]);

    const setRow = (key: number, change: Partial<DataRow>) =>
        setRows((list) => list.map((row) => (row.key === key ? { ...row, ...change } : row)));
    const addRow = () => setRows((list) => {
        const used = new Set(list.map((row) => row.number));
        const free = positions.find((number) => !used.has(number));
        return free ? [...list, { key: nextKey(), id: null, number: free, gridId: null, detectorId: null, notes: "" }] : list;
    });

    const addImages = (kind: "session" | "dataset", ownerId: number) => async (files: File[]) => {
        let added = 0;
        for (const file of files) {
            try {
                setCurrent((await addSessionImage(kind, ownerId, file)).session);
                added += 1;
            } catch (e: any) {
                toast.error(`${file.name}: ${String(e?.message || "Failed to upload the image")}`);
            }
        }
        if (added) toast.success(added === 1 ? "Image kept." : `${added} images kept.`);
    };
    const removeImage = async (image: FacilityImage) => {
        try {
            setCurrent(await deleteFacilityImage<FacilitySession>(image.id));
            toast.success("Image removed.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to remove the image"));
        }
    };

    const numbersRepeat = new Set(rows.map((row) => row.number)).size !== rows.length;

    const save = async () => {
        if (microscopeId === "") return;
        const atlas = session?.datasets.find((dataset) => dataset.kind === "atlas");
        const payload: SessionPayload = {
            // Unchanged on a new session: the server names it
            name: name.trim(),
            microscopeId,
            technique,
            status,
            groupId: groupId === "" ? null : groupId,
            userId: userId === "" ? null : userId,
            bookingRef: bookingRef.trim(),
            scheduledOn: scheduledOn || null,
            notes: notes.trim(),
            userNotes: userNotes.trim(),
            templateId,
            autoProcess,
            oneProject,
            ctfMinDefocus: technique === "spa" && ctfMinDefocus.trim() ? Number(ctfMinDefocus) : null,
            ctfMaxDefocus: technique === "spa" && ctfMaxDefocus.trim() ? Number(ctfMaxDefocus) : null,
            ctfMaxResolution: technique === "spa" && ctfMaxResolution.trim() ? Number(ctfMaxResolution) : null,
            datasets: [
                ...(atlas ? [{ id: atlas.id, kind: "atlas" as const, notes: atlas.notes }] : []),
                ...rows.map((row) => ({ id: row.id, kind: "data" as const, number: row.number, gridId: row.gridId,
                                        detectorId: row.detectorId, notes: row.notes.trim() })),
            ],
        };
        setSaving(true);
        try {
            if (session) await updateSession(session.id, payload);
            else await createSession(payload);
            toast.success("Session saved.");
            onSaved();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the session"));
        } finally {
            setSaving(false);
        }
    };

    const atlas = current?.datasets.find((dataset) => dataset.kind === "atlas");
    const tint = sectionTint(isDark);
    // The band behind each group's name in the template list, across the whole width
    const groupBackground = isDark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
    const toggleGroup = (group: string) => setClosedGroups((closed) => {
        const next = new Set(closed);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        return next;
    });
    const person = userId === "" ? null : people.find((candidate) => candidate.id === userId)
        ?? { id: userId, email: session?.userEmail ?? "", firstName: session?.userName ?? `#${userId}`, lastName: "" };
    const toggleNote = (key: number) => setNotesOpen((open) => {
        const next = new Set(open);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
    });

    return (
        <SettingsDialog
            title={session ? `Edit ${session.name}` : "New session"}
            description="A stay on a microscope and the folders it writes: an ATLAS, and a DATA per grid."
            icon={<CalendarClock size={20} color="white" />}
            confirmLabel="Save"
            busyLabel="Saving…"
            busy={saving}
            confirmDisabled={microscopeId === "" || numbersRepeat}
            maxWidth="md"
            closeButton
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => void save()}
            onClose={onClose}
        >
            <Stack spacing={2}>
                <DialogPart icon={<CalendarDays size={18} />} title="Who and when" tint={tint} colors={colors}
                            subtitle="The microscope, the day and whom the session is for.">
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel id="session-microscope-label">Microscope</InputLabel>
                            <Select labelId="session-microscope-label" label="Microscope" sx={selectSx} value={microscopeId}
                                    MenuProps={{ PaperProps: { sx: menuPaperSx } }} disabled={!!session}
                                    renderValue={(value) => microscopes.find((candidate) => candidate.id === value)?.name ?? session?.microscopeName ?? ""}
                                    onChange={(e) => setMicroscopeId(Number(e.target.value))}>
                                {microscopes.map((candidate) => (
                                    <MenuItem key={candidate.id} value={candidate.id} disabled={!candidate.sessionsEnabled}>
                                        {candidate.name}{candidate.sessionsEnabled ? "" : " (no sessions)"}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField sx={fieldSx} size="small" type="date" label="Day" value={scheduledOn} fullWidth
                                   InputLabelProps={{ shrink: true }} onChange={(e) => setScheduledOn(e.target.value)} />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, minWidth: 90 }}>Technique</Typography>
                        <ToggleButtonGroup exclusive size="small" value={technique} aria-label="Technique"
                                           onChange={(_, value) => value && setTechnique(value as SessionTechnique)}
                                           sx={choiceButtonsSx({ ...colors, card: "", primary: primary }, isDark)}>
                            {(Object.keys(TECHNIQUE_LABELS) as SessionTechnique[]).map((value) => (
                                <ToggleButton key={value} value={value}>{TECHNIQUE_LABELS[value]}</ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    </Stack>
                    {session && (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, minWidth: 90 }}>Status</Typography>
                            <ToggleButtonGroup exclusive size="small" value={status} aria-label="Status"
                                               onChange={(_, value) => value && setStatus(value as SessionStatus)}
                                               sx={choiceButtonsSx({ ...colors, card: "", primary: primary }, isDark)}>
                                {(Object.keys(SESSION_STATUS_LABELS) as SessionStatus[]).map((value) => (
                                    <ToggleButton key={value} value={value}>{SESSION_STATUS_LABELS[value]}</ToggleButton>
                                ))}
                            </ToggleButtonGroup>
                        </Stack>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <Autocomplete
                            size="small"
                            fullWidth
                            options={people}
                            value={person}
                            getOptionLabel={(option) => personName(option)}
                            isOptionEqualToValue={(option, value) => option.id === value.id}
                            onChange={(_, option) => setUserId(option ? option.id : "")}
                            slotProps={{ paper: { sx: menuPaperSx } }}
                            renderOption={(props, option) => (
                                <Box component="li" {...props} key={option.id}>
                                    <Box>
                                        <Box sx={{ fontSize: FACILITY_TEXT.itemLine }}>{personName(option)}</Box>
                                        <Box sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>{option.email}</Box>
                                    </Box>
                                </Box>
                            )}
                            renderInput={(params) => (
                                <TextField {...params} sx={fieldSx} label="User" placeholder="Search by name or email" />
                            )}
                            filterOptions={(options, { inputValue }) => {
                                const words = inputValue.trim().toLowerCase();
                                return options.filter((option) => `${personName(option)} ${option.email}`.toLowerCase().includes(words));
                            }}
                        />
                        <FormControl size="small" fullWidth>
                            <InputLabel id="session-group-label">Group</InputLabel>
                            <Select labelId="session-group-label" label="Group" sx={selectSx} value={groupId}
                                    MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                    onChange={(e) => setGroupId(String(e.target.value) === "" ? "" : Number(e.target.value))}>
                                <MenuItem value="">None</MenuItem>
                                {groups.map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <TextField sx={fieldSx} size="small" label="EMhub booking" value={bookingRef} fullWidth
                                   onChange={(e) => setBookingRef(e.target.value)} />
                        <TextField sx={fieldSx} size="small" label="Name" value={name} disabled={nameFixed} fullWidth
                                   placeholder="Given by the facility's convention"
                                   helperText={nameFixed
                                       ? "The microscope writes its folders under this name: it stays."
                                       : "Empty: the facility's pattern names it."}
                                   inputProps={{ style: { fontFamily: "monospace" } }}
                                   onChange={(e) => setName(e.target.value)} />
                    </Stack>
                </DialogPart>

                <DialogPart icon={<LayoutGrid size={18} />} title="Grids" tint={tint} colors={colors}
                            subtitle={`A DATA folder each, by its position in the autoloader · ${rows.length} of ${positions.length} positions used.`}
                            action={
                                <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Plus size={14} />}
                                        disabled={rows.length >= positions.length} onClick={addRow}>
                                    Add grid
                                </Button>
                            }>
                    {rows.length === 0 && (
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                            No grid yet: add one per grid that will be acquired.
                        </Typography>
                    )}
                    {rows.map((row) => {
                        const saved = row.id != null ? datasetById.get(row.id) : undefined;
                        const showNote = notesOpen.has(row.key) || !!row.notes;
                        return (
                            <Box key={row.key} role="group" aria-label={`Position ${row.number}`}
                                 sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, px: 1.5, py: 1.25 }}>
                                <Stack spacing={1.25}>
                                    <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems={{ md: "center" }}>
                                        <FormControl size="small" sx={{ minWidth: 110 }}>
                                            <InputLabel id={`data-number-${row.key}`}>Position</InputLabel>
                                            <Select labelId={`data-number-${row.key}`} label="Position" sx={selectSx} value={row.number}
                                                    MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                                    onChange={(e) => setRow(row.key, { number: Number(e.target.value) })}>
                                                {[...new Set([...positions, row.number])].map((number) => (
                                                    <MenuItem key={number} value={number} disabled={number > positions.length}>{number}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        <Autocomplete
                                            size="small"
                                            sx={{ flex: 1, minWidth: 240 }}
                                            options={gridOptions}
                                            groupBy={(option) => option.sampleCode}
                                            getOptionLabel={(option) => option.label}
                                            isOptionEqualToValue={(option, value) => option.id === value.id}
                                            value={row.gridId != null ? gridLabel.get(row.gridId) ?? null : null}
                                            onChange={(_, option) => setRow(row.key, { gridId: option?.id ?? null })}
                                            slotProps={{ paper: { sx: menuPaperSx } }}
                                            renderInput={(params) => (
                                                <TextField {...params} sx={fieldSx} label="Grid"
                                                           placeholder={saved?.grid ? describeDatasetGrid(saved) : "Sample, box and position"} />
                                            )}
                                        />
                                        <FormControl size="small" sx={{ minWidth: 170 }}>
                                            <InputLabel id={`data-detector-${row.key}`}>Detector</InputLabel>
                                            <Select labelId={`data-detector-${row.key}`} label="Detector" sx={selectSx}
                                                    value={row.detectorId ?? ""} MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                                    onChange={(e) => setRow(row.key, { detectorId: String(e.target.value) === "" ? null : Number(e.target.value) })}>
                                                <MenuItem value="">From the movies</MenuItem>
                                                {(microscope?.detectors ?? []).map((detector) => (
                                                    <MenuItem key={detector.id} value={detector.id}>{detector.name}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
                                            <Tooltip arrow title={showNote ? "" : "Add a note (staff only)"}>
                                                <span>
                                                    <IconButton size="small" aria-label={`Note for position ${row.number}`}
                                                                disabled={!!row.notes} onClick={() => toggleNote(row.key)}
                                                                sx={{ color: showNote ? primary : colors.muted }}>
                                                        <StickyNote size={17} />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                            <Tooltip arrow title="Remove this grid">
                                                <IconButton size="small" aria-label={`Remove position ${row.number}`} sx={{ color: "#dc2626" }}
                                                            onClick={() => setRows((list) => list.filter((other) => other.key !== row.key))}>
                                                    <Trash2 size={17} />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </Stack>
                                    {saved?.folder && (
                                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                            Folder{" "}
                                            <Box component="span" sx={{ fontFamily: "monospace", color: colors.text }}>{saved.folder}</Box>
                                        </Typography>
                                    )}
                                    {showNote && (
                                        <TextField sx={fieldSx} size="small" label="Notes (staff only)" value={row.notes} autoFocus={!row.notes}
                                                   onChange={(e) => setRow(row.key, { notes: e.target.value })} />
                                    )}
                                    {saved && (
                                        <ImageStrip images={saved.images ?? []} size={44} colors={colors}
                                                    onAdd={addImages("dataset", saved.id)} onRemove={removeImage}
                                                    addLabel="Add images (grid squares…)" />
                                    )}
                                </Stack>
                            </Box>
                        );
                    })}
                    {numbersRepeat && <Alert severity="warning">Two grids share a position.</Alert>}
                </DialogPart>

                <DialogPart icon={<Workflow size={18} />} title="Automatic processing" tint={tint} colors={colors}
                            subtitle="A project per DATA from a workflow template, made and launched in streaming as the movies arrive.">
                    <FormControl size="small" fullWidth>
                        <InputLabel id="session-template-label">Processing template</InputLabel>
                        <Select labelId="session-template-label" label="Processing template" sx={selectSx} value={templateId}
                                // A list of its own size: as wide as the field, and scrolling past a few workflows
                                MenuProps={{
                                    PaperProps: { sx: { ...menuPaperSx, maxHeight: 360, maxWidth: 640 } },
                                    anchorOrigin: { vertical: "bottom", horizontal: "left" },
                                    transformOrigin: { vertical: "top", horizontal: "left" },
                                }}
                                renderValue={(value) => templateOptions.find((item) => item.id === value)?.name ?? String(value)}
                                onChange={(e) => setTemplateId(String(e.target.value))}>
                            {templateOptions.flatMap((item, index) => {
                                const startsGroup = !!item.group && item.group !== templateOptions[index - 1]?.group;
                                const closed = !!item.group && closedGroups.has(item.group);
                                const inGroup = templateOptions.filter((other) => other.group === item.group).length;
                                return [
                                    ...(startsGroup
                                        // A branch of the tree: a click opens or closes it; it scrolls away with its workflows
                                        ? [<ListSubheader key={`group-${item.group}`} disableSticky
                                                          sx={{ p: 0, lineHeight: "normal", bgcolor: groupBackground,
                                                                borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`,
                                                                mt: index > 0 ? 0.5 : 0 }}>
                                            {/* The Select keeps the clicks on its children: the branch listens on its own box */}
                                            <Box role="button" tabIndex={-1} aria-expanded={!closed} aria-label={`${item.group} workflows`}
                                                 onClick={(event) => {
                                                     event.stopPropagation();
                                                     toggleGroup(item.group);
                                                 }}
                                                 sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer", px: 2,
                                                       fontSize: FACILITY_TEXT.note, fontWeight: 800, lineHeight: 2.4, color: colors.text,
                                                       textTransform: "uppercase", letterSpacing: 0.5, userSelect: "none",
                                                       "&:hover": { bgcolor: colors.hover } }}>
                                                {closed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                                {closed ? <Folder size={16} /> : <FolderOpen size={16} />}
                                                <Box component="span" sx={{ flex: 1 }}>{item.group}</Box>
                                                <Box component="span" sx={{ fontWeight: 600, color: colors.muted, textTransform: "none" }}>{inGroup}</Box>
                                            </Box>
                                        </ListSubheader>]
                                        : []),
                                    // A closed branch hides its workflows but keeps them, so the chosen one still shows in the field
                                    <MenuItem key={item.id || "none"} value={item.id} disabled={item.canLoad === false}
                                              sx={{ whiteSpace: "normal", pl: item.group ? 5 : 2, gap: 1.25, alignItems: "flex-start",
                                                    display: closed ? "none" : "flex" }}>
                                        <Box sx={{ pt: 0.25, display: "flex", flexShrink: 0,
                                                   color: !item.id ? colors.muted : item.canLoad === false ? colors.muted : "primary.main" }}>
                                            {item.id ? <Workflow size={16} /> : <Ban size={16} />}
                                        </Box>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Box sx={{ fontSize: FACILITY_TEXT.itemLine }}>{item.name}</Box>
                                            {item.canLoad === false && item.disabledReason && (
                                                <Box sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>{item.disabledReason}</Box>
                                            )}
                                        </Box>
                                    </MenuItem>,
                                ];
                            })}
                            {templatesLoading && <MenuItem disabled value="__loading">Loading the workflows…</MenuItem>}
                        </Select>
                    </FormControl>
                    {!templateId ? (
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                            Without a template the folders are watched, but no project is made.
                        </Typography>
                    ) : (
                        <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, px: 1.75 }}>
                            <OptionRow colors={colors} title="Launch it by itself" checked={autoProcess} onChange={setAutoProcess}
                                       description="Each DATA's project starts as soon as its first movie is read. Off: it waits for Process now." />
                            <OptionRow colors={colors} title="All grids in one project" checked={oneProject} onChange={setOneProject}
                                       description="Every DATA in the session's project, each in its own branch: the same sample. Off: a project per DATA." />
                            {/* The CTF consensus is SPA's: a tomography template has none to apply them to */}
                            {technique === "spa" && (
                                <Box sx={{ borderTop: `1px solid ${colors.border}`, py: 1.5 }}>
                                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700 }}>CTF limits</Typography>
                                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mb: 1.25 }}>
                                        Micrographs outside them are left out. Empty: the template's are used.
                                    </Typography>
                                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                                        <TextField sx={fieldSx} size="small" fullWidth label="CTF: minimum defocus (Å)" value={ctfMinDefocus}
                                                   inputProps={{ inputMode: "decimal" }} onChange={(e) => setCtfMinDefocus(e.target.value)} />
                                        <TextField sx={fieldSx} size="small" fullWidth label="CTF: maximum defocus (Å)" value={ctfMaxDefocus}
                                                   inputProps={{ inputMode: "decimal" }} onChange={(e) => setCtfMaxDefocus(e.target.value)} />
                                        <TextField sx={fieldSx} size="small" fullWidth label="CTF: resolution better than (Å)" value={ctfMaxResolution}
                                                   inputProps={{ inputMode: "decimal" }} onChange={(e) => setCtfMaxResolution(e.target.value)} />
                                    </Stack>
                                </Box>
                            )}
                        </Box>
                    )}
                </DialogPart>

                <DialogPart icon={<MessageSquare size={18} />} title="Notes" tint={tint} colors={colors}
                            subtitle="For the staff, and for the user, who reads them in My sessions.">
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <TextField sx={fieldSx} size="small" fullWidth label="Staff notes" value={notes} multiline minRows={2}
                                   helperText="Only the facility's staff see them"
                                   onChange={(e) => setNotes(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Notes for the user" value={userNotes} multiline minRows={2}
                                   helperText="The user and the group's PI see them"
                                   onChange={(e) => setUserNotes(e.target.value)} />
                    </Stack>
                </DialogPart>

                <DialogPart icon={<ImageIcon size={18} />} title="Images" tint={tint} colors={colors}
                            subtitle={current ? "Of the session and of its atlas; a grid's images go with its grid above." : "Save the session first to add its images."}>
                    {current && (
                        <Stack spacing={1}>
                            <ImageStrip images={current.images ?? []} size={56} colors={colors}
                                        onAdd={addImages("session", current.id)} onRemove={removeImage}
                                        addLabel="Add session images" />
                            {atlas && (
                                <Stack spacing={0.5}>
                                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>ATLAS</Typography>
                                    <ImageStrip images={atlas.images ?? []} size={56} colors={colors}
                                                onAdd={addImages("dataset", atlas.id)} onRemove={removeImage}
                                                addLabel="Add atlas images" />
                                </Stack>
                            )}
                        </Stack>
                    )}
                </DialogPart>

                {current && (
                    <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: 2.5, overflow: "hidden" }}>
                        <SessionFolders session={current} colors={colors} />
                    </Box>
                )}
            </Stack>
        </SettingsDialog>
    );
}
