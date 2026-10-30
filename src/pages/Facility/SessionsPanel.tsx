import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    CircularProgress,
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { AlertTriangle, CalendarClock, Copy, Play, Plus, RefreshCw, Search, Square, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";

import SettingsDialog, { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import { listGroupNames } from "@/api/access";
import { loadCurrentUserOnce } from "@/api/auth";
import { listUsers } from "@/api/projects";
import {
    addSessionImage,
    createSession,
    deleteFacilityImage,
    deleteSession,
    listMicroscopes,
    listSamples,
    listSessions,
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
import { FACILITY_TEXT } from "./facilityStyles";
import ImageStrip from "./ImageStrip";

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

const SESSION_STATUS_COLORS: Record<SessionStatus, string> = {
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

const DATA_NUMBERS = Array.from({ length: 12 }, (_, index) => index + 1);
const SEARCH_DELAY_MS = 300;
// While a session acquires, the list follows its folders: the watcher looks at them every 30 s
const ACQUIRING_REFRESH_MS = 30000;

const WATCH_LABELS: Record<DatasetWatch, string> = {
    receiving: "Receiving",
    stalled: "No new movies",
    idle: "",
    noOffload: "No offload folder",
    pending: "Looking…",
    noFolder: "Folder not made yet",
    waiting: "Waiting for movies",
};

const WATCH_COLORS: Record<DatasetWatch, string> = {
    receiving: "#16a34a",
    stalled: "#d97706",
    idle: "#64748b",
    noOffload: "#dc2626",
    pending: "#64748b",
    noFolder: "#64748b",
    waiting: "#2563eb",
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
function SessionFolders({ session, colors }: { session: FacilitySession; colors: PanelStyles["colors"] }) {
    return (
        <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 1.5, px: 1.25, py: 0.75 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.25 }}>
                <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 700, color: colors.muted }}>
                    Folders for the microscope
                </Typography>
                <Button size="small" variant="text" startIcon={<Copy size={14} />}
                        sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note }}
                        onClick={() => copyFolders(session.datasets.map((dataset) => dataset.folder).join("\n"), "Folder names")}>
                    Copy all
                </Button>
            </Stack>
            <Stack spacing={0.25}>
                {session.datasets.map((dataset) => (
                    <Stack key={dataset.id} direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
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
                        <DatasetProgress dataset={dataset} colors={colors} />
                    </Stack>
                ))}
            </Stack>
        </Box>
    );
}

/** Where a DATA's acquisition is: its state, and what its movies say. */
function DatasetProgress({ dataset, colors }: { dataset: SessionDataset; colors: PanelStyles["colors"] }) {
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
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, ml: "auto !important", flexShrink: 1 }}>
            {line && (
                <Typography noWrap sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, minWidth: 0 }}>{line}</Typography>
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

export default function SessionsPanel({ fieldSx, cardSx, cardHeaderSx, selectSx, menuPaperSx, colors, actionButtonSx,
                                        saveButtonSx, canEdit }: PanelStyles & { canEdit: boolean }) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = saveButtonSx ?? ROUNDED_BUTTON_SX;
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
        <Stack spacing={1.75}>
            {error && <Alert severity="error">{error}</Alert>}
            <Card variant="outlined" sx={cardSx}>
                <CardHeader
                    title="Sessions"
                    subheader="Each stay on a microscope: who it is for, its booking, and the folders the microscope writes, an ATLAS and a DATA per grid, each DATA pointing to the grid it was acquired on."
                    sx={cardHeaderSx}
                    action={
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
                />
                <CardContent sx={{ pt: 2 }}>
                    <Stack spacing={1.25}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                            <TextField sx={{ ...fieldSx, flex: 1 }} size="small" placeholder="Search by name, booking, user or group"
                                       value={search} onChange={(e) => setSearch(e.target.value)}
                                       inputProps={{ "aria-label": "Search sessions" }}
                                       InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
                            <FormControl size="small" sx={{ minWidth: 220 }}>
                                <InputLabel id="session-filter-label">Show</InputLabel>
                                <Select labelId="session-filter-label" label="Show" sx={selectSx} value={filter}
                                        MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                        onChange={(e) => setFilter(e.target.value as SessionFilter)}>
                                    {(Object.keys(FILTER_LABELS) as SessionFilter[]).map((value) => (
                                        <MenuItem key={value} value={value}>{FILTER_LABELS[value]}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>
                        {loading && sessions.length === 0 && (
                            <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>
                        )}
                        {!loading && sessions.length === 0 && (
                            <Alert severity="info">{appliedSearch || filter !== "active" ? "No session matches." : "No sessions planned or under way."}</Alert>
                        )}
                        {sessions.map((session) => (
                            <Box key={session.id} sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.5 }}>
                                <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                                    <Stack spacing={0.4} sx={{ minWidth: 0 }}>
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 800, color: colors.text,
                                                              fontFamily: "monospace", wordBreak: "break-all" }}>
                                                {session.name}
                                            </Typography>
                                            <Box sx={{ px: 0.9, py: 0.15, borderRadius: 10, flexShrink: 0,
                                                       border: `1px solid ${SESSION_STATUS_COLORS[session.status]}`,
                                                       color: SESSION_STATUS_COLORS[session.status] }}>
                                                <Typography sx={{ fontSize: FACILITY_TEXT.badge, fontWeight: 700 }}>
                                                    {SESSION_STATUS_LABELS[session.status]}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                                            {[session.microscopeName, TECHNIQUE_LABELS[session.technique], formatDate(session.scheduledOn),
                                              session.userName || session.userEmail, session.groupName && `group ${session.groupName}`,
                                              session.bookingRef && `booking ${session.bookingRef}`].filter(Boolean).join(" · ")}
                                        </Typography>
                                        {(session.images?.length ?? 0) > 0 && (
                                            <Box sx={{ pt: 0.5 }}><ImageStrip images={session.images ?? []} size={56} colors={colors} /></Box>
                                        )}
                                    </Stack>
                                    {canEdit && (
                                        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                            {session.status === "planned" && (
                                                <Button size="small" variant="outlined" sx={actionSx} startIcon={<Play size={14} />}
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
                                            <Button size="small" variant="outlined" sx={actionSx} onClick={() => setEditing(session)}>
                                                Edit
                                            </Button>
                                            {session.status === "planned" && (
                                                <Button size="small" variant="outlined" sx={{ ...actionSx, color: "error.main" }}
                                                        onClick={() => setDeleting(session)}>
                                                    Delete
                                                </Button>
                                            )}
                                        </Stack>
                                    )}
                                </Stack>
                                <Box sx={{ mt: 1.25 }}><SessionFolders session={session} colors={colors} /></Box>
                            </Box>
                        ))}
                    </Stack>
                </CardContent>
            </Card>

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
    const [rows, setRows] = useState<DataRow[]>(() => dataRowsOf(session));
    // The session as the server last answered: its images change at once, not on Save
    const [current, setCurrent] = useState<FacilitySession | null>(session);
    const [microscopes, setMicroscopes] = useState<Microscope[]>([]);
    const [gridOptions, setGridOptions] = useState<GridOption[]>([]);
    const [groups, setGroups] = useState<Named[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [saving, setSaving] = useState(false);

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

    const microscope = microscopes.find((candidate) => candidate.id === microscopeId);
    const nameFixed = !!session && session.status !== "planned";
    const gridLabel = useMemo(() => new Map(gridOptions.map((option) => [option.id, option])), [gridOptions]);
    const userName = useMemo(() => new Map(people.map((person) => [person.id, personName(person)])), [people]);
    const datasetById = useMemo(() => new Map((current?.datasets ?? []).map((dataset) => [dataset.id, dataset])), [current]);

    const setRow = (key: number, change: Partial<DataRow>) =>
        setRows((list) => list.map((row) => (row.key === key ? { ...row, ...change } : row)));
    const addRow = () => setRows((list) => {
        const used = new Set(list.map((row) => row.number));
        const free = DATA_NUMBERS.find((number) => !used.has(number));
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

    return (
        <SettingsDialog
            title={session ? `Edit ${session.name}` : "New session"}
            description="A stay on a microscope and the folders it writes: an ATLAS, and a DATA per grid (multigrid: up to 12)."
            icon={<CalendarClock size={20} color="white" />}
            confirmLabel="Save"
            busyLabel="Saving…"
            busy={saving}
            confirmDisabled={microscopeId === "" || numbersRepeat}
            maxWidth="md"
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => void save()}
            onClose={onClose}
        >
            <Stack spacing={1.5} sx={{ pt: 0.5 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
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
                    <FormControl size="small" fullWidth>
                        <InputLabel id="session-technique-label">Technique</InputLabel>
                        <Select labelId="session-technique-label" label="Technique" sx={selectSx} value={technique}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                onChange={(e) => setTechnique(e.target.value as SessionTechnique)}>
                            {(Object.keys(TECHNIQUE_LABELS) as SessionTechnique[]).map((value) => (
                                <MenuItem key={value} value={value}>{TECHNIQUE_LABELS[value]}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                        <InputLabel id="session-status-label">Status</InputLabel>
                        <Select labelId="session-status-label" label="Status" sx={selectSx} value={status}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                onChange={(e) => setStatus(e.target.value as SessionStatus)}>
                            {(Object.keys(SESSION_STATUS_LABELS) as SessionStatus[]).map((value) => (
                                <MenuItem key={value} value={value}>{SESSION_STATUS_LABELS[value]}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <FormControl size="small" fullWidth>
                        <InputLabel id="session-user-label">User</InputLabel>
                        <Select labelId="session-user-label" label="User" sx={selectSx} value={userId}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                renderValue={(value) => (String(value) === "" ? "None" : userName.get(Number(value)) ?? session?.userName ?? `#${value}`)}
                                onChange={(e) => setUserId(String(e.target.value) === "" ? "" : Number(e.target.value))}>
                            <MenuItem value="">None</MenuItem>
                            {people.map((person) => (
                                <MenuItem key={person.id} value={person.id}>{personName(person)} ({person.email})</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
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
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField sx={fieldSx} size="small" type="date" label="Day" value={scheduledOn} fullWidth
                               InputLabelProps={{ shrink: true }} onChange={(e) => setScheduledOn(e.target.value)} />
                    <TextField sx={fieldSx} size="small" label="EMhub booking" value={bookingRef} fullWidth
                               onChange={(e) => setBookingRef(e.target.value)} />
                </Stack>
                <TextField sx={fieldSx} size="small" label="Name" value={name} disabled={nameFixed}
                           placeholder="Given by the facility's convention"
                           helperText={nameFixed
                               ? "The microscope writes its folders under this name: it stays."
                               : "Left empty, it is YYYY_MM_DD_Name-Surname_id (the day, the user and the session's number). It makes the folder names and stays once the acquisition starts."}
                           inputProps={{ style: { fontFamily: "monospace" } }}
                           onChange={(e) => setName(e.target.value)} />
                <TextField sx={fieldSx} size="small" label="Staff notes" value={notes} multiline minRows={2}
                           onChange={(e) => setNotes(e.target.value)} />

                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle, fontWeight: 700 }}>Grids (DATA folders)</Typography>
                    <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Plus size={14} />}
                            disabled={rows.length >= DATA_NUMBERS.length} onClick={addRow}>
                        Add DATA
                    </Button>
                </Stack>
                {rows.length === 0 && (
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, opacity: 0.75 }}>Only the ATLAS: no DATA yet.</Typography>
                )}
                {rows.map((row) => {
                    const saved = row.id != null ? datasetById.get(row.id) : undefined;
                    return (
                        <Box key={row.key} role="group" aria-label={`DATA_${String(row.number).padStart(2, "0")}`}
                             sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.25 }}>
                            <Stack spacing={1}>
                                <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
                                    <FormControl size="small" sx={{ minWidth: 118 }}>
                                        <InputLabel id={`data-number-${row.key}`}>Folder</InputLabel>
                                        <Select labelId={`data-number-${row.key}`} label="Folder" sx={selectSx} value={row.number}
                                                MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                                onChange={(e) => setRow(row.key, { number: Number(e.target.value) })}>
                                            {DATA_NUMBERS.map((number) => (
                                                <MenuItem key={number} value={number}>DATA_{String(number).padStart(2, "0")}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <Autocomplete
                                        size="small"
                                        sx={{ flex: 1, minWidth: 260 }}
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
                                    <IconButton size="small" aria-label={`Remove DATA_${String(row.number).padStart(2, "0")}`}
                                                onClick={() => setRows((list) => list.filter((other) => other.key !== row.key))}>
                                        <X size={16} />
                                    </IconButton>
                                </Stack>
                                <TextField sx={fieldSx} size="small" label="Notes" value={row.notes}
                                           onChange={(e) => setRow(row.key, { notes: e.target.value })} />
                                {saved && (
                                    <ImageStrip images={saved.images ?? []} size={44} colors={colors}
                                                onAdd={addImages("dataset", saved.id)} onRemove={removeImage}
                                                addLabel="Add images (grid squares…)" />
                                )}
                            </Stack>
                        </Box>
                    );
                })}
                {numbersRepeat && <Alert severity="warning">Two grids share a DATA folder.</Alert>}

                <Stack spacing={0.75}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle, fontWeight: 700 }}>Images</Typography>
                    {current
                        ? (
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
                        )
                        : <Typography sx={{ fontSize: FACILITY_TEXT.note, opacity: 0.75 }}>Save the session first to add its images.</Typography>}
                </Stack>
                {current && <SessionFolders session={current} colors={colors} />}
            </Stack>
        </SettingsDialog>
    );
}
