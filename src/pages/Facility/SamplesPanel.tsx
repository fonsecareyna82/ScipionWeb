import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
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
import { Camera, FlaskConical, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
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
                        <Box sx={{ minWidth: 56, px: 0.75, py: 0.4, borderRadius: 1.5, textAlign: "center",
                                   border: `1px solid ${grid ? STATUS_COLORS[grid.status] : colors.border}`,
                                   color: grid ? colors.text : colors.muted, opacity: grid ? 1 : 0.6 }}>
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

export default function SamplesPanel({ fieldSx, cardSx, cardHeaderSx, selectSx, menuPaperSx, colors, actionButtonSx,
                                       saveButtonSx, canEdit }: PanelStyles & { canEdit: boolean }) {
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
        <Stack spacing={1.75}>
            {error && <Alert severity="error">{error}</Alert>}
            <Card variant="outlined" sx={cardSx}>
                <CardHeader
                    title="Samples and grids"
                    subheader="Each sample by its NZ code, the boxes its grids were vitrified into, and every grid in its box position; a session's DATA will point to the grid it was acquired on."
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
                                    New sample
                                </Button>
                            )}
                        </Stack>
                    }
                />
                <CardContent sx={{ pt: 2 }}>
                    <Stack spacing={1.25}>
                        <TextField sx={fieldSx} size="small" placeholder="Search by code or description" value={search}
                                   onChange={(e) => setSearch(e.target.value)}
                                   inputProps={{ "aria-label": "Search samples" }}
                                   InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
                        {loading && samples.length === 0 && (
                            <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>
                        )}
                        {!loading && samples.length === 0 && (
                            <Alert severity="info">{appliedSearch ? "No sample matches." : "No samples yet."}</Alert>
                        )}
                        {samples.map((sample) => {
                            const grids = sample.boxes.flatMap((box) => box.grids);
                            const loaded = grids.filter((grid) => grid.status === "loaded").length;
                            return (
                                <Box key={sample.id} sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.5 }}>
                                    <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                                        <Stack spacing={0.4} sx={{ minWidth: 0 }}>
                                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 800, color: colors.text }}>
                                                {sample.code}
                                                {sample.description && (
                                                    <Typography component="span" sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 500, color: colors.muted, ml: 1 }}>
                                                        {sample.description}
                                                    </Typography>
                                                )}
                                            </Typography>
                                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                                                {[sample.groupName && `Group ${sample.groupName}`,
                                                  (sample.ownerName || sample.ownerEmail) && `owner ${sample.ownerName || sample.ownerEmail}`,
                                                  sample.accessRoute,
                                                  `${sample.boxes.length} box${sample.boxes.length === 1 ? "" : "es"}, ${grids.length} grid${grids.length === 1 ? "" : "s"}${loaded ? ` (${loaded} loaded)` : ""}`]
                                                    .filter(Boolean).join(" · ")}
                                            </Typography>
                                            {(sample.images?.length ?? 0) > 0 && (
                                                <Box sx={{ pt: 0.5 }}><ImageStrip images={sample.images ?? []} size={64} colors={colors} /></Box>
                                            )}
                                        </Stack>
                                        {canEdit && (
                                            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                                <Button size="small" variant="outlined" sx={actionSx} onClick={() => setEditing(sample)}>
                                                    Edit
                                                </Button>
                                                <Button size="small" variant="outlined" sx={{ ...actionSx, color: "error.main" }}
                                                        onClick={() => setDeleting(sample)}>
                                                    Delete
                                                </Button>
                                            </Stack>
                                        )}
                                    </Stack>
                                    {sample.boxes.length > 0 && (
                                        <Stack spacing={1} sx={{ mt: 1.25 }}>
                                            {sample.boxes.map((box) => (
                                                <Stack key={box.id ?? box.label} direction={{ xs: "column", sm: "row" }} spacing={1.25}
                                                       alignItems={{ sm: "center" }}>
                                                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, minWidth: 190, color: colors.text }}>
                                                        Box {box.label}
                                                        <Typography component="span" sx={{ fontSize: FACILITY_TEXT.badge, fontWeight: 500, color: colors.muted, ml: 0.75 }}>
                                                            {[box.vitrificationCode, formatDate(box.vitrifiedOn)].filter(Boolean).join(" · ")}
                                                        </Typography>
                                                    </Typography>
                                                    <GridSlots box={box} colors={colors} />
                                                    {(box.images?.length ?? 0) > 0 && (
                                                        <ImageStrip images={box.images ?? []} size={44} colors={colors} />
                                                    )}
                                                </Stack>
                                            ))}
                                        </Stack>
                                    )}
                                </Box>
                            );
                        })}
                    </Stack>
                </CardContent>
            </Card>

            {deleting !== null && (
                <SettingsDialog
                    title="Delete sample?"
                    description="Its boxes and grids go with it. This action cannot be undone."
                    icon={<Trash2 size={20} color="#fca5a5" />}
                    confirmLabel="Delete"
                    busyLabel="Deleting…"
                    busy={deleteBusy}
                    destructive
                    maxWidth="xs"
                    actionButtonSx={actionSx}
                    onConfirm={() => void remove(deleting)}
                    onClose={() => setDeleting(null)}
                >
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine }}>
                        <strong>{deleting.code}</strong> · {deleting.boxes.length} boxes,{" "}
                        {deleting.boxes.reduce((count, box) => count + box.grids.length, 0)} grids
                    </Typography>
                </SettingsDialog>
            )}

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
        <Typography sx={{ fontSize: FACILITY_TEXT.note, opacity: 0.75 }}>Save the {what} first to add its images.</Typography>
    );

    const ownerName = useMemo(() => new Map(people.map((person) => [person.id, personName(person)])), [people]);

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

    const gridField = { ...fieldSx, "& .MuiInputBase-input": { ...(fieldSx?.["& .MuiInputBase-input"] ?? {}), py: 0.75 } };

    return (
        <SettingsDialog
            title={sample ? `Edit ${sample.code}` : "New sample"}
            description="A sample, the boxes its grids were vitrified into and each grid in its position. Grid rows left blank are not kept."
            icon={<FlaskConical size={20} color="white" />}
            confirmLabel="Save"
            busyLabel="Saving…"
            busy={saving}
            confirmDisabled={!code.trim() || boxes.some((box) => !box.label.trim())}
            maxWidth="md"
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => void save()}
            onClose={onClose}
        >
            <Stack spacing={1.5} sx={{ pt: 0.5 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField sx={{ ...fieldSx, minWidth: 160 }} size="small" label="Code" value={code} placeholder="NZ251"
                               onChange={(e) => setCode(e.target.value)} />
                    <TextField sx={fieldSx} size="small" fullWidth label="Description" value={description}
                               onChange={(e) => setDescription(e.target.value)} />
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <FormControl size="small" fullWidth>
                        <InputLabel id="sample-group-label">Group</InputLabel>
                        <Select labelId="sample-group-label" label="Group" sx={selectSx} value={groupId}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                onChange={(e) => setGroupId(String(e.target.value) === "" ? "" : Number(e.target.value))}>
                            <MenuItem value="">None</MenuItem>
                            {groups.map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                        <InputLabel id="sample-owner-label">Owner</InputLabel>
                        <Select labelId="sample-owner-label" label="Owner" sx={selectSx} value={ownerId}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                renderValue={(value) => (String(value) === "" ? "None" : ownerName.get(Number(value)) ?? sample?.ownerName ?? `#${value}`)}
                                onChange={(e) => setOwnerId(String(e.target.value) === "" ? "" : Number(e.target.value))}>
                            <MenuItem value="">None</MenuItem>
                            {people.map((person) => (
                                <MenuItem key={person.id} value={person.id}>{personName(person)} ({person.email})</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField sx={fieldSx} size="small" fullWidth label="Access route" value={accessRoute}
                               placeholder="Instruct PID 45466" onChange={(e) => setAccessRoute(e.target.value)} />
                </Stack>
                <TextField sx={fieldSx} size="small" label="Notes" value={notes} multiline minRows={2}
                           placeholder="Vitrobot humidity and temperature, glow discharge…" onChange={(e) => setNotes(e.target.value)} />
                <Stack spacing={0.75}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle, fontWeight: 700 }}>Images of the sample</Typography>
                    {sample
                        ? <ImageStrip images={imagesOf("sample", sample.id)} size={64} colors={colors}
                                      onAdd={addImages("sample", sample.id)} onRemove={removeImage} />
                        : unsavedNote("sample")}
                </Stack>

                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle, fontWeight: 700 }}>Grid boxes</Typography>
                    <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Plus size={14} />} onClick={addBox}>
                        Add box
                    </Button>
                </Stack>
                {boxes.length === 0 && (
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, opacity: 0.75 }}>No boxes yet.</Typography>
                )}
                {boxes.map((box) => (
                    <Box key={box.key} sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.5 }}>
                        <Stack spacing={1.25}>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} alignItems={{ sm: "center" }}>
                                <TextField sx={{ ...fieldSx, minWidth: 130 }} size="small" label="Box" value={box.label}
                                           placeholder="2 green" onChange={(e) => setBox(box.key, { label: e.target.value })} />
                                <TextField sx={fieldSx} size="small" label="Vitrification" value={box.vitrificationCode}
                                           placeholder="NZ251.2" onChange={(e) => setBox(box.key, { vitrificationCode: e.target.value })} />
                                <TextField sx={fieldSx} size="small" type="date" label="Vitrified on" value={box.vitrifiedOn}
                                           InputLabelProps={{ shrink: true }}
                                           onChange={(e) => setBox(box.key, { vitrifiedOn: e.target.value })} />
                                <Box sx={{ flex: 1 }} />
                                <IconButton size="small" aria-label={`Remove box ${box.label}`}
                                            onClick={() => setBoxes((rows) => rows.filter((row) => row.key !== box.key))}>
                                    <Trash2 size={16} />
                                </IconButton>
                            </Stack>
                            {box.id
                                ? <ImageStrip images={imagesOf("box", box.id)} size={48} colors={colors}
                                              onAdd={addImages("box", box.id)} onRemove={removeImage} addLabel="Add box images" />
                                : unsavedNote("box")}
                            {box.grids.map((grid) => (
                                <Stack key={grid.key} spacing={0.75}>
                                <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
                                    <FormControl size="small" sx={{ minWidth: 92 }}>
                                        <InputLabel id={`grid-position-${grid.key}`}>Position</InputLabel>
                                        <Select labelId={`grid-position-${grid.key}`} label="Position" sx={selectSx} value={grid.position}
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
                                    <TextField sx={{ ...gridField, width: { md: 110 } }} size="small" label="Conc." value={grid.concentration}
                                               placeholder="0.3" inputProps={{ "aria-label": "Concentration" }}
                                               onChange={(e) => setGrid(box.key, grid.key, { concentration: e.target.value })} />
                                    <TextField sx={{ ...gridField, flex: 1 }} size="small" label="Specimen" value={grid.specimen}
                                               placeholder="Dimer +5mM MnCl2" inputProps={{ "aria-label": "Specimen" }}
                                               onChange={(e) => setGrid(box.key, grid.key, { specimen: e.target.value })} />
                                    <FormControl size="small" sx={{ minWidth: 130 }}>
                                        <InputLabel id={`grid-status-${grid.key}`}>Status</InputLabel>
                                        <Select labelId={`grid-status-${grid.key}`} label="Status" sx={selectSx} value={grid.status}
                                                MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                                onChange={(e) => setGrid(box.key, grid.key, { status: e.target.value as GridStatus })}>
                                            {(Object.keys(STATUS_LABELS) as GridStatus[]).map((value) => (
                                                <MenuItem key={value} value={value}>{STATUS_LABELS[value]}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <Tooltip arrow title="Images of this grid (atlas, screening…)">
                                        <IconButton size="small" aria-label="Grid images"
                                                    color={openGridImages.has(grid.key) ? "primary" : "default"}
                                                    onClick={() => setOpenGridImages((keys) => {
                                                        const next = new Set(keys);
                                                        if (next.has(grid.key)) next.delete(grid.key); else next.add(grid.key);
                                                        return next;
                                                    })}>
                                            <Camera size={16} />
                                            {imagesOf("grid", grid.id).length > 0 && (
                                                <Typography component="span" sx={{ fontSize: FACILITY_TEXT.badge, ml: 0.25 }}>
                                                    {imagesOf("grid", grid.id).length}
                                                </Typography>
                                            )}
                                        </IconButton>
                                    </Tooltip>
                                    <IconButton size="small" aria-label="Remove grid"
                                                onClick={() => setBox(box.key, { grids: box.grids.filter((other) => other.key !== grid.key) })}>
                                        <X size={16} />
                                    </IconButton>
                                </Stack>
                                {openGridImages.has(grid.key) && (
                                    <Box sx={{ pl: { md: 1 } }}>
                                        {grid.id
                                            ? <ImageStrip images={imagesOf("grid", grid.id)} size={48} colors={colors}
                                                          onAdd={addImages("grid", grid.id)} onRemove={removeImage}
                                                          addLabel="Add grid images" />
                                            : unsavedNote("grid")}
                                    </Box>
                                )}
                                </Stack>
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
            </Stack>
        </SettingsDialog>
    );
}
