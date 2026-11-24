import { useCallback, useEffect, useMemo, useState } from "react";
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
    MenuItem,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    Boxes, Camera, FlaskConical, Images, LayoutGrid, MessageSquare, Package, Pencil, Plus, RefreshCw, Search, Ticket, Trash2,
    UserRound, UsersRound, X,
} from "lucide-react";
import toast from "react-hot-toast";

import SettingsDialog, { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import { listGroupNames } from "@/api/access";
import { loadCurrentUserOnce } from "@/api/auth";
import { listUsers } from "@/api/projects";
import {
    addFacilityImage,
    createSample,
    deleteFacilityImage,
    deleteSample,
    listSamples,
    updateSample,
    type FacilityImage,
    type ImageOwnerKind,
    type Grid,
    type GridBox,
    type GridStatus,
    type Sample,
    type SamplePayload,
} from "@/api/facility";
import { useIsDark } from "@/context/ThemeContext";
import { SettingsSection, sectionTint } from "@/pages/Settings/SettingsSection";
import { DialogPart } from "./DialogParts";
import { FACILITY_TEXT, useFacilityStyles } from "./facilityStyles";
import { SessionFacts, type SessionFact } from "./SessionsPanel";
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

const STATUS_LABELS: Record<GridStatus, string> = {
    stored: "In storage",
    loaded: "Loaded",
    used: "Used",
    discarded: "Discarded",
};

const STATUS_COLORS: Record<GridStatus, string> = {
    stored: "#64748b",
    loaded: "#2563eb",
    used: "#16a34a",
    discarded: "#dc2626",
};

const POSITIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const SEARCH_DELAY_MS = 300;
// A grid box holds four grids: a new box starts with their four rows
const NEW_BOX_POSITIONS = [1, 2, 3, 4];

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

// Rows of the dialog while edited: numbers as text, so a half-typed one stays as typed
type GridRow = Omit<Grid, "gridNumber"> & { key: number; gridNumber: string };
type BoxRow = Omit<GridBox, "grids" | "vitrifiedOn"> & { key: number; vitrifiedOn: string; grids: GridRow[] };

let rowKey = 0;
const nextKey = () => ++rowKey;

function emptyGrid(position: number): GridRow {
    return { key: nextKey(), id: null, position, gridNumber: "", gridType: "", concentration: "", specimen: "",
             status: "stored", notes: "" };
}

function boxRowsOf(sample: Sample | null): BoxRow[] {
    return (sample?.boxes ?? []).map((box) => ({
        ...box,
        key: nextKey(),
        vitrifiedOn: box.vitrifiedOn ? box.vitrifiedOn.slice(0, 10) : "",
        grids: box.grids.map((grid) => ({ ...grid, key: nextKey(), gridNumber: grid.gridNumber == null ? "" : String(grid.gridNumber) })),
    }));
}

// A grid row with nothing but its position is left out
function isEmptyGrid(row: GridRow): boolean {
    return !row.id && !row.gridNumber.trim() && !row.gridType.trim() && !row.concentration.trim()
        && !row.specimen.trim() && !row.notes.trim() && row.status === "stored";
}

function GridSlots({ box, colors }: { box: GridBox; colors: PanelStyles["colors"] }) {
    const byPosition = new Map(box.grids.map((grid) => [grid.position, grid]));
    const slots = Math.max(4, ...box.grids.map((grid) => grid.position));
    return (
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
            {Array.from({ length: slots }, (_, index) => index + 1).map((position) => {
                const grid = byPosition.get(position);
                return (
                    <Tooltip key={position} arrow
                             title={grid
                                 ? [`Position ${position}`, grid.gridNumber != null ? `grid ${grid.gridNumber}` : "", grid.gridType,
                                    grid.concentration && `${grid.concentration} mg/ml`, grid.specimen, STATUS_LABELS[grid.status],
                                    grid.images?.length ? `${grid.images.length} image${grid.images.length === 1 ? "" : "s"}` : ""]
                                     .filter(Boolean).join(" · ")
                                 : `Position ${position}: empty`}>
                        <Box sx={{ minWidth: 62, px: 0.75, py: 0.4, borderRadius: 1.5, textAlign: "center",
                                   border: `1px ${grid ? "solid" : "dashed"} ${grid ? STATUS_COLORS[grid.status] : colors.border}`,
                                   bgcolor: grid ? `${STATUS_COLORS[grid.status]}14` : "transparent",
                                   color: grid ? colors.text : colors.muted, opacity: grid ? 1 : 0.7 }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.badge, fontWeight: 700, lineHeight: 1.3 }}>
                                {grid?.gridNumber != null ? `#${grid.gridNumber}` : position}
                                {grid?.images?.length ? <Camera size={12} style={{ marginLeft: 4, verticalAlign: "-1px" }} /> : null}
                            </Typography>
                            <Typography sx={{ fontSize: FACILITY_TEXT.badge, lineHeight: 1.2, color: grid ? STATUS_COLORS[grid.status] : colors.muted }}>
                                {grid ? (grid.gridType || STATUS_LABELS[grid.status]) : "—"}
                            </Typography>
                        </Box>
                    </Tooltip>
                );
            })}
        </Stack>
    );
}

/** What each colour of a grid means, beside the list. */
function StatusLegend({ colors }: { colors: PanelStyles["colors"] }) {
    return (
        <Stack direction="row" useFlexGap flexWrap="wrap" columnGap={1.75} rowGap={0.5} aria-label="Grid states">
            {(Object.keys(STATUS_LABELS) as GridStatus[]).map((status) => (
                <Stack key={status} direction="row" spacing={0.6} alignItems="center">
                    <Box sx={{ width: 10, height: 10, borderRadius: 0.75, bgcolor: STATUS_COLORS[status] }} />
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>{STATUS_LABELS[status]}</Typography>
                </Stack>
            ))}
        </Stack>
    );
}

/** A small tinted label beside a name. */
function Pill({ color, children }: { color: string; children: string }) {
    return (
        <Box component="span" sx={{ px: 1, borderRadius: 10, flexShrink: 0, lineHeight: 1.7, fontSize: FACILITY_TEXT.badge,
                                    fontWeight: 700, color, bgcolor: `${color}1f`, whiteSpace: "nowrap" }}>
            {children}
        </Box>
    );
}

function plural(count: number, one: string, many = `${one}s`): string {
    return `${count} ${count === 1 ? one : many}`;
}

export default function SamplesPanel({ fieldSx, selectSx, menuPaperSx, colors, actionButtonSx,
                                       saveButtonSx, canEdit }: PanelStyles & { canEdit: boolean }) {
    const isDark = useIsDark();
    // The look of the Settings sections (card colour, the accent of the icons)
    const sectionColors = { ...useFacilityStyles().colors, ...colors };
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = saveButtonSx ?? ROUNDED_BUTTON_SX;
    const [samples, setSamples] = useState<Sample[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [editing, setEditing] = useState<Sample | "new" | null>(null);
    const [deleting, setDeleting] = useState<Sample | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setAppliedSearch(search.trim()), SEARCH_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setSamples(await listSamples(appliedSearch));
        } catch (e: any) {
            setError(String(e?.message || "Failed to load the samples"));
        } finally {
            setLoading(false);
        }
    }, [appliedSearch]);

    useEffect(() => {
        void load();
    }, [load]);

    const remove = useCallback(async (sample: Sample) => {
        setDeleteBusy(true);
        try {
            await deleteSample(sample.id);
            toast.success("Sample deleted.");
            setDeleting(null);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to delete the sample"));
        } finally {
            setDeleteBusy(false);
        }
    }, [load]);

    return (
        <Stack spacing={2}>
            <SettingsSection
                plain
                icon={<FlaskConical size={19} />}
                title="Samples and grids"
                subtitle="Each sample by your facility's own code, the boxes its grids were vitrified into, and every grid in its place. A session's DATA points to the grid it was taken on."
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
                                New sample
                            </Button>
                        )}
                    </Stack>
                }
            >
                <Stack spacing={1.5}>
                    {error && <Alert severity="error">{error}</Alert>}
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}
                           justifyContent="space-between">
                        <Stack direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
                            <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle, fontWeight: 700, color: colors.text }}>
                                {loading && samples.length === 0 ? "Loading samples…" : plural(samples.length, "sample")}
                            </Typography>
                            <StatusLegend colors={colors} />
                        </Stack>
                        <TextField sx={{ ...fieldSx, width: { xs: "100%", md: 340 } }} size="small"
                                   placeholder="Search by code or description" value={search}
                                   onChange={(e) => setSearch(e.target.value)}
                                   inputProps={{ "aria-label": "Search samples" }}
                                   InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
                    </Stack>
                    {loading && samples.length === 0 && (
                        <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>
                    )}
                    {!loading && samples.length === 0 && (
                        <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 3, textAlign: "center" }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                                {appliedSearch ? "No sample matches." : "No samples yet."}
                            </Typography>
                            {canEdit && !appliedSearch && (
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.5 }}>
                                    Add one with New sample: its boxes and grids go with it.
                                </Typography>
                            )}
                        </Box>
                    )}
                    {samples.map((sample) => {
                        const grids = sample.boxes.flatMap((box) => box.grids);
                        const loaded = grids.filter((grid) => grid.status === "loaded").length;
                        const facts: SessionFact[] = [
                            { icon: <UsersRound size={15} />, text: sample.groupName ? `group ${sample.groupName}` : "" },
                            { icon: <UserRound size={15} />, text: sample.ownerName || sample.ownerEmail || "" },
                            { icon: <Ticket size={15} />, text: sample.accessRoute ?? "" },
                            { icon: <Package size={15} />, text: plural(sample.boxes.length, "box", "boxes") },
                            { icon: <LayoutGrid size={15} />, text: plural(grids.length, "grid") },
                        ];
                        return (
                            <Box key={sample.id} data-testid={`sample-${sample.id}`}
                                 sx={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${sectionColors.primary}`,
                                       borderRadius: 2.5, bgcolor: sectionColors.card, overflow: "hidden" }}>
                                <Box sx={{ px: 2, pt: 1.5, pb: 1.25 }}>
                                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} alignItems={{ sm: "flex-start" }}
                                           justifyContent="space-between">
                                        <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                                            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ minWidth: 0 }}>
                                                <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle + 0.5, fontWeight: 800, color: colors.text,
                                                                  fontFamily: "monospace", wordBreak: "break-all" }}>
                                                    {sample.code}
                                                </Typography>
                                                {sample.description && (
                                                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                                                        {sample.description}
                                                    </Typography>
                                                )}
                                                {loaded > 0 && <Pill color={STATUS_COLORS.loaded}>{`${loaded} loaded`}</Pill>}
                                            </Stack>
                                            <SessionFacts facts={facts} colors={colors} label="About the sample" />
                                            {(sample.images?.length ?? 0) > 0 && (
                                                <Box sx={{ pt: 0.25 }}><ImageStrip images={sample.images ?? []} size={64} colors={colors} /></Box>
                                            )}
                                        </Stack>
                                        {canEdit && (
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                                                <Button size="small" variant="outlined" sx={actionSx} startIcon={<Pencil size={14} />}
                                                        onClick={() => setEditing(sample)}>
                                                    Edit
                                                </Button>
                                                <Tooltip arrow title="Delete">
                                                    <IconButton size="small" aria-label={`Delete ${sample.code}`} sx={{ color: "#dc2626" }}
                                                                onClick={() => setDeleting(sample)}>
                                                        <Trash2 size={17} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        )}
                                    </Stack>
                                </Box>
                                {sample.boxes.length > 0 && (
                                    <Box sx={{ borderTop: `1px solid ${colors.border}`, bgcolor: colors.hover, px: 2, py: 1.25 }}>
                                        <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 800, color: colors.muted,
                                                          textTransform: "uppercase", letterSpacing: 0.5, mb: 0.75 }}>
                                            Grid boxes
                                        </Typography>
                                        <Stack spacing={1}>
                                            {sample.boxes.map((box) => (
                                                <Stack key={box.id ?? box.label} direction={{ xs: "column", sm: "row" }} spacing={1.25}
                                                       alignItems={{ sm: "center" }}>
                                                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 210 }}>
                                                        <Package size={16} style={{ color: colors.muted, flexShrink: 0 }} />
                                                        <Box sx={{ minWidth: 0 }}>
                                                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text, lineHeight: 1.3 }}>
                                                                Box {box.label}
                                                            </Typography>
                                                            {(box.vitrificationCode || box.vitrifiedOn) && (
                                                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, lineHeight: 1.3 }}>
                                                                    {[box.vitrificationCode, formatDate(box.vitrifiedOn)].filter(Boolean).join(" · ")}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    </Stack>
                                                    <GridSlots box={box} colors={colors} />
                                                    {(box.images?.length ?? 0) > 0 && (
                                                        <ImageStrip images={box.images ?? []} size={44} colors={colors} />
                                                    )}
                                                </Stack>
                                            ))}
                                        </Stack>
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </Stack>
            </SettingsSection>

            {deleting !== null && (() => {
                const grids = deleting.boxes.flatMap((box) => box.grids);
                const loaded = grids.filter((grid) => grid.status === "loaded").length;
                return (
                    <SettingsDialog
                        title="Delete sample?"
                        description="Its boxes, grids and images go with it. This action cannot be undone."
                        icon={<Trash2 size={20} color="#fca5a5" />}
                        confirmLabel="Delete"
                        busyLabel="Deleting…"
                        busy={deleteBusy}
                        destructive
                        maxWidth="xs"
                        actionButtonSx={actionSx}
                        closeButton
                        onConfirm={() => void remove(deleting)}
                        onClose={() => setDeleting(null)}
                    >
                        <Stack spacing={1.25}>
                            <Box sx={{ border: `1px solid ${colors.border}`, borderLeft: "4px solid #dc2626", borderRadius: 2, px: 1.5, py: 1.25 }}>
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 800, fontFamily: "monospace" }}>
                                    {deleting.code}
                                </Typography>
                                {deleting.description && (
                                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>{deleting.description}</Typography>
                                )}
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, mt: 0.5 }}>
                                    {plural(deleting.boxes.length, "box", "boxes")}, {plural(grids.length, "grid")}
                                    {(deleting.images?.length ?? 0) > 0 ? `, ${plural(deleting.images?.length ?? 0, "image")}` : ""}
                                </Typography>
                            </Box>
                            {loaded > 0 && (
                                <Alert severity="warning" sx={{ fontSize: FACILITY_TEXT.note }}>
                                    {loaded === 1 ? "One of its grids is" : `${loaded} of its grids are`} loaded in a microscope now.
                                </Alert>
                            )}
                        </Stack>
                    </SettingsDialog>
                );
            })()}

            {editing !== null && (
                <SampleDialog
                    sample={editing === "new" ? null : editing}
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

function SampleDialog({ sample, colors, fieldSx, selectSx, menuPaperSx, actionButtonSx, saveButtonSx, onClose, onSaved }: {
    sample: Sample | null;
    colors: PanelStyles["colors"];
    fieldSx: any;
    selectSx: any;
    menuPaperSx: any;
    actionButtonSx: any;
    saveButtonSx: any;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [code, setCode] = useState(sample?.code ?? "");
    const [description, setDescription] = useState(sample?.description ?? "");
    const [groupId, setGroupId] = useState<number | "">(sample?.groupId ?? "");
    const [ownerId, setOwnerId] = useState<number | "">(sample?.ownerId ?? "");
    const [accessRoute, setAccessRoute] = useState(sample?.accessRoute ?? "");
    const [notes, setNotes] = useState(sample?.notes ?? "");
    const [boxes, setBoxes] = useState<BoxRow[]>(() => boxRowsOf(sample));
    // The sample as the server last answered: its images change at once, not on Save
    const [current, setCurrent] = useState<Sample | null>(sample);
    const [openGridImages, setOpenGridImages] = useState<Set<number>>(new Set());
    const [groups, setGroups] = useState<Named[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void Promise.all([
            listGroupNames().catch(() => [] as Named[]),
            listUsers().catch(() => [] as Person[]),
            loadCurrentUserOnce().catch(() => null),
        ]).then(([loadedGroups, loadedUsers, me]) => {
            if (cancelled) return;
            setGroups(loadedGroups);
            const everyone = [...(me ? [me as Person] : []), ...(loadedUsers as Person[])];
            setPeople(everyone.filter((person, index) => everyone.findIndex((other) => other.id === person.id) === index));
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const setBox = (key: number, change: Partial<BoxRow>) =>
        setBoxes((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
    const setGrid = (boxKey: number, gridKey: number, change: Partial<GridRow>) =>
        setBoxes((rows) => rows.map((row) => (row.key !== boxKey ? row : {
            ...row, grids: row.grids.map((grid) => (grid.key === gridKey ? { ...grid, ...change } : grid)),
        })));

    const addBox = () => setBoxes((rows) => [...rows, {
        key: nextKey(), id: null, label: String(rows.length + 1), vitrificationCode: rows[rows.length - 1]?.vitrificationCode ?? "",
        vitrifiedOn: rows[rows.length - 1]?.vitrifiedOn ?? "", notes: "", grids: NEW_BOX_POSITIONS.map(emptyGrid),
    }]);
    const addGrid = (boxKey: number) => setBoxes((rows) => rows.map((row) => {
        if (row.key !== boxKey) return row;
        const used = new Set(row.grids.map((grid) => grid.position));
        const free = POSITIONS.find((position) => !used.has(position));
        return free ? { ...row, grids: [...row.grids, emptyGrid(free)] } : row;
    }));

    const imagesOf = useMemo(() => {
        const byOwner = new Map<string, FacilityImage[]>();
        byOwner.set(`sample:${current?.id}`, current?.images ?? []);
        for (const box of current?.boxes ?? []) {
            byOwner.set(`box:${box.id}`, box.images ?? []);
            for (const grid of box.grids) byOwner.set(`grid:${grid.id}`, grid.images ?? []);
        }
        return (kind: ImageOwnerKind, id: number | null | undefined) => (id ? byOwner.get(`${kind}:${id}`) ?? [] : []);
    }, [current]);

    const addImages = (kind: ImageOwnerKind, ownerId: number) => async (files: File[]) => {
        let added = 0;
        for (const file of files) {
            try {
                setCurrent((await addFacilityImage(kind, ownerId, file)).sample);
                added += 1;
            } catch (e: any) {
                toast.error(`${file.name}: ${String(e?.message || "Failed to upload the image")}`);
            }
        }
        if (added) toast.success(added === 1 ? "Image kept." : `${added} images kept.`);
    };
    const removeImage = async (image: FacilityImage) => {
        try {
            setCurrent(await deleteFacilityImage(image.id));
            toast.success("Image removed.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to remove the image"));
        }
    };
    const unsavedNote = (what: string) => (
        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>Save the {what} first to add its images.</Typography>
    );

    const save = async () => {
        const payload: SamplePayload = {
            code: code.trim(),
            description: description.trim(),
            groupId: groupId === "" ? null : groupId,
            ownerId: ownerId === "" ? null : ownerId,
            accessRoute: accessRoute.trim(),
            notes: notes.trim(),
            boxes: boxes.map((box) => ({
                id: box.id ?? null,
                label: box.label.trim(),
                vitrificationCode: box.vitrificationCode.trim(),
                vitrifiedOn: box.vitrifiedOn || null,
                notes: box.notes.trim(),
                grids: box.grids.filter((grid) => !isEmptyGrid(grid)).map((grid) => ({
                    id: grid.id ?? null,
                    position: grid.position,
                    gridNumber: grid.gridNumber.trim() ? Number(grid.gridNumber) : null,
                    gridType: grid.gridType.trim(),
                    concentration: grid.concentration.trim(),
                    specimen: grid.specimen.trim(),
                    status: grid.status,
                    notes: grid.notes.trim(),
                })),
            })),
        };
        setSaving(true);
        try {
            if (sample) await updateSample(sample.id, payload);
            else await createSample(payload);
            toast.success("Sample saved.");
            onSaved();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the sample"));
        } finally {
            setSaving(false);
        }
    };

    const isDark = useIsDark();
    const tint = sectionTint(isDark);
    const owner: Person | null = ownerId === ""
        ? null
        : people.find((person) => person.id === ownerId)
            ?? { id: ownerId, email: sample?.ownerEmail ?? "", firstName: sample?.ownerName ?? `#${ownerId}` };
    const gridField = { ...fieldSx, "& .MuiInputBase-input": { ...(fieldSx?.["& .MuiInputBase-input"] ?? {}), py: 0.75 } };
    const statusDot = (status: GridStatus) => (
        <Box component="span" sx={{ display: "inline-block", width: 10, height: 10, borderRadius: 0.75, mr: 1, flexShrink: 0,
                                    bgcolor: STATUS_COLORS[status] }} />
    );

    return (
        <SettingsDialog
            title={sample ? `Edit ${sample.code}` : "New sample"}
            description="A sample, the boxes its grids were vitrified into and each grid in its place."
            icon={<FlaskConical size={20} color="white" />}
            confirmLabel="Save"
            busyLabel="Saving…"
            busy={saving}
            confirmDisabled={!code.trim() || boxes.some((box) => !box.label.trim())}
            maxWidth="md"
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            closeButton
            onConfirm={() => void save()}
            onClose={onClose}
        >
            <Stack spacing={2} sx={{ pt: 0.5 }}>
                <DialogPart icon={<FlaskConical size={18} />} title="The sample" tint={tint} colors={colors}
                            subtitle="How the facility knows it, and whose it is.">
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={{ ...fieldSx, minWidth: 200 }} size="small" label="Code" value={code} placeholder="e.g. NZ251, S-0042"
                                   helperText="Your facility's own code, any format; unique" FormHelperTextProps={{ sx: { fontSize: 13.5 } }}
                                   onChange={(e) => setCode(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Description" value={description}
                                   placeholder="What it is" onChange={(e) => setDescription(e.target.value)} />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <Autocomplete
                            size="small"
                            fullWidth
                            options={people}
                            value={owner}
                            getOptionLabel={(option) => personName(option)}
                            isOptionEqualToValue={(option, value) => option.id === value.id}
                            onChange={(_, option) => setOwnerId(option ? option.id : "")}
                            slotProps={{ paper: { sx: menuPaperSx } }}
                            renderOption={(props, option) => (
                                <Box component="li" {...props} key={option.id}>
                                    <Box>
                                        <Box sx={{ fontSize: FACILITY_TEXT.itemLine }}>{personName(option)}</Box>
                                        <Box sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>{option.email}</Box>
                                    </Box>
                                </Box>
                            )}
                            filterOptions={(options, { inputValue }) => {
                                const words = inputValue.trim().toLowerCase();
                                return options.filter((option) => `${personName(option)} ${option.email}`.toLowerCase().includes(words));
                            }}
                            renderInput={(params) => <TextField {...params} sx={fieldSx} label="Owner" placeholder="Search by name or email" />}
                        />
                        <FormControl size="small" fullWidth>
                            <InputLabel id="sample-group-label">Group</InputLabel>
                            <Select labelId="sample-group-label" label="Group" sx={selectSx} value={groupId}
                                    MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                    onChange={(e) => setGroupId(String(e.target.value) === "" ? "" : Number(e.target.value))}>
                                <MenuItem value="">None</MenuItem>
                                {groups.map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Stack>
                    <TextField sx={fieldSx} size="small" label="Access route" value={accessRoute}
                               placeholder="e.g. Instruct PID 45466" helperText="The programme or proposal it came through"
                               FormHelperTextProps={{ sx: { fontSize: 13.5 } }} onChange={(e) => setAccessRoute(e.target.value)} />
                </DialogPart>

                <DialogPart icon={<MessageSquare size={18} />} title="Notes and images" tint={tint} colors={colors}
                            subtitle="How it was prepared, and photos of it. Images are kept at once.">
                    <TextField sx={fieldSx} size="small" label="Notes" value={notes} multiline minRows={2}
                               placeholder="Vitrobot humidity and temperature, glow discharge…" onChange={(e) => setNotes(e.target.value)} />
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Images size={16} style={{ color: colors.muted }} />
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text }}>Images of the sample</Typography>
                    </Stack>
                    {sample
                        ? <ImageStrip images={imagesOf("sample", sample.id)} size={64} colors={colors}
                                      onAdd={addImages("sample", sample.id)} onRemove={removeImage} />
                        : unsavedNote("sample")}
                </DialogPart>

                <DialogPart icon={<Boxes size={18} />} title="Grid boxes" tint={tint} colors={colors}
                            subtitle="Each box and the grid in each place. Grid rows left blank are not kept."
                            action={
                                <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Plus size={14} />} onClick={addBox}>
                                    Add box
                                </Button>
                            }>
                    {boxes.length === 0 && (
                        <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 2, textAlign: "center" }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                No boxes yet. A new box comes with four grid rows.
                            </Typography>
                        </Box>
                    )}
                    {boxes.map((box) => (
                        <Box key={box.key} sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, overflow: "hidden" }}>
                            <Box sx={{ bgcolor: colors.hover, px: 1.5, py: 1.25, borderBottom: `1px solid ${colors.border}` }}>
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} alignItems={{ sm: "center" }}>
                                    <Package size={18} style={{ color: colors.muted, flexShrink: 0 }} />
                                    <TextField sx={{ ...fieldSx, minWidth: 130 }} size="small" label="Box" value={box.label}
                                               placeholder="2 green" onChange={(e) => setBox(box.key, { label: e.target.value })} />
                                    <TextField sx={fieldSx} size="small" label="Vitrification" value={box.vitrificationCode}
                                               placeholder="e.g. NZ251.2" onChange={(e) => setBox(box.key, { vitrificationCode: e.target.value })} />
                                    <TextField sx={fieldSx} size="small" type="date" label="Vitrified on" value={box.vitrifiedOn}
                                               InputLabelProps={{ shrink: true }}
                                               onChange={(e) => setBox(box.key, { vitrifiedOn: e.target.value })} />
                                    <Box sx={{ flex: 1 }} />
                                    <Tooltip arrow title="Remove the box">
                                        <IconButton size="small" aria-label={`Remove box ${box.label}`} sx={{ color: "#dc2626" }}
                                                    onClick={() => setBoxes((rows) => rows.filter((row) => row.key !== box.key))}>
                                            <Trash2 size={17} />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                                <Box sx={{ pt: 1 }}>
                                    {box.id
                                        ? <ImageStrip images={imagesOf("box", box.id)} size={48} colors={colors}
                                                      onAdd={addImages("box", box.id)} onRemove={removeImage} addLabel="Add box images" />
                                        : unsavedNote("box")}
                                </Box>
                            </Box>
                            <Stack spacing={1} sx={{ p: 1.5 }}>
                                {box.grids.length === 0 && (
                                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>No grids in this box.</Typography>
                                )}
                                {box.grids.map((grid) => (
                                    <Box key={grid.key} sx={{ borderLeft: `3px solid ${STATUS_COLORS[grid.status]}`, pl: 1.25 }}>
                                        <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
                                            <FormControl size="small" sx={{ minWidth: 92 }}>
                                                <InputLabel id={`grid-position-${grid.key}`}>Place</InputLabel>
                                                <Select labelId={`grid-position-${grid.key}`} label="Place" sx={selectSx} value={grid.position}
                                                        MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                                        onChange={(e) => setGrid(box.key, grid.key, { position: Number(e.target.value) })}>
                                                    {POSITIONS.map((position) => <MenuItem key={position} value={position}>{position}</MenuItem>)}
                                                </Select>
                                            </FormControl>
                                            <TextField sx={{ ...gridField, width: { md: 92 } }} size="small" label="Grid #" value={grid.gridNumber}
                                                       inputProps={{ inputMode: "numeric", "aria-label": "Grid number" }}
                                                       onChange={(e) => setGrid(box.key, grid.key, { gridNumber: e.target.value })} />
                                            <TextField sx={{ ...gridField, width: { md: 140 } }} size="small" label="Type" value={grid.gridType}
                                                       placeholder="Au 1.2/1.3" inputProps={{ "aria-label": "Grid type" }}
                                                       onChange={(e) => setGrid(box.key, grid.key, { gridType: e.target.value })} />
                                            <TextField sx={{ ...gridField, width: { md: 110 } }} size="small" label="mg/ml" value={grid.concentration}
                                                       placeholder="0.3" inputProps={{ "aria-label": "Concentration" }}
                                                       onChange={(e) => setGrid(box.key, grid.key, { concentration: e.target.value })} />
                                            <TextField sx={{ ...gridField, flex: 1 }} size="small" label="Specimen" value={grid.specimen}
                                                       placeholder="Dimer +5mM MnCl2" inputProps={{ "aria-label": "Specimen" }}
                                                       onChange={(e) => setGrid(box.key, grid.key, { specimen: e.target.value })} />
                                            <FormControl size="small" sx={{ minWidth: 140 }}>
                                                <InputLabel id={`grid-status-${grid.key}`}>Status</InputLabel>
                                                <Select labelId={`grid-status-${grid.key}`} label="Status" sx={selectSx} value={grid.status}
                                                        MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                                        renderValue={(value) => (
                                                            <Box component="span" sx={{ display: "inline-flex", alignItems: "center" }}>
                                                                {statusDot(value as GridStatus)}{STATUS_LABELS[value as GridStatus]}
                                                            </Box>
                                                        )}
                                                        onChange={(e) => setGrid(box.key, grid.key, { status: e.target.value as GridStatus })}>
                                                    {(Object.keys(STATUS_LABELS) as GridStatus[]).map((value) => (
                                                        <MenuItem key={value} value={value}>{statusDot(value)}{STATUS_LABELS[value]}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                            <Stack direction="row" spacing={0.25}>
                                                <Tooltip arrow title="Images of this grid (atlas, screening…)">
                                                    <IconButton size="small" aria-label="Grid images"
                                                                color={openGridImages.has(grid.key) ? "primary" : "default"}
                                                                onClick={() => setOpenGridImages((keys) => {
                                                                    const next = new Set(keys);
                                                                    if (next.has(grid.key)) next.delete(grid.key); else next.add(grid.key);
                                                                    return next;
                                                                })}>
                                                        <Camera size={17} />
                                                        {imagesOf("grid", grid.id).length > 0 && (
                                                            <Typography component="span" sx={{ fontSize: FACILITY_TEXT.badge, ml: 0.25 }}>
                                                                {imagesOf("grid", grid.id).length}
                                                            </Typography>
                                                        )}
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip arrow title="Remove the grid">
                                                    <IconButton size="small" aria-label="Remove grid"
                                                                onClick={() => setBox(box.key, { grids: box.grids.filter((other) => other.key !== grid.key) })}>
                                                        <X size={17} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        </Stack>
                                        {openGridImages.has(grid.key) && (
                                            <Box sx={{ pt: 1 }}>
                                                {grid.id
                                                    ? <ImageStrip images={imagesOf("grid", grid.id)} size={48} colors={colors}
                                                                  onAdd={addImages("grid", grid.id)} onRemove={removeImage}
                                                                  addLabel="Add grid images" />
                                                    : unsavedNote("grid")}
                                            </Box>
                                        )}
                                    </Box>
                                ))}
                                <Box>
                                    <Button size="small" variant="text" sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note }}
                                            startIcon={<Plus size={14} />} disabled={box.grids.length >= POSITIONS.length}
                                            onClick={() => addGrid(box.key)}>
                                        Add grid
                                    </Button>
                                </Box>
                            </Stack>
                        </Box>
                    ))}
                </DialogPart>
            </Stack>
        </SettingsDialog>
    );
}
