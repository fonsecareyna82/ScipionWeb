import { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    CircularProgress,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { ImagePlus, Microscope as MicroscopeIcon, Plus, RefreshCw, Trash2, X } from "lucide-react";
import SettingsDialog, { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import { FACILITY_TEXT } from "./facilityStyles";
import toast from "react-hot-toast";

import {
    createMicroscope,
    deleteMicroscope,
    deleteMicroscopePhoto,
    fetchMicroscopePhotoUrl,
    listMicroscopes,
    updateMicroscope,
    uploadMicroscopePhoto,
    type GainFlip,
    type Microscope,
    type MicroscopePayload,
    type MicroscopeStatus,
} from "@/api/facility";

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

const STATUS_LABELS: Record<MicroscopeStatus, string> = {
    operational: "Operational",
    maintenance: "Maintenance",
    out_of_service: "Out of service",
};

const GAIN_FLIP_LABELS: Record<GainFlip, string> = {
    none: "No flip",
    horizontal: "Flip horizontally",
    vertical: "Flip vertically",
};

const GAIN_ROTATIONS = [0, 90, 180, 270] as const;

// A row of the calibration table while it is edited: text, so a half-typed number stays as typed
type PixelRow = { key: number; magnification: string; pixelSize: string };

function pixelRowsOf(microscope: Microscope | null): PixelRow[] {
    return (microscope?.pixelSizes ?? []).map((row, index) => ({
        key: index,
        magnification: String(row.magnification),
        pixelSize: String(row.pixelSize),
    }));
}

function optionalNumber(text: string): number | null {
    const value = Number(text.trim());
    return text.trim() && Number.isFinite(value) ? value : null;
}

const PHOTO_TYPES = "image/png,image/jpeg,image/webp";

/** The photo of a microscope (read with the session), or its icon while it has none. */
function MicroscopePhoto({ microscope, src, width, height, colors }: {
    microscope?: Microscope | null;
    // A photo chosen and not yet uploaded, shown instead of the stored one
    src?: string | null;
    width: number;
    height: number;
    colors: PanelStyles["colors"];
}) {
    const [storedUrl, setStoredUrl] = useState<string | null>(null);
    const version = microscope?.photoUpdatedAt ?? null;

    useEffect(() => {
        if (!microscope || !version || src !== undefined) {
            setStoredUrl(null);
            return;
        }
        let cancelled = false;
        let url: string | null = null;
        fetchMicroscopePhotoUrl(microscope.id, version)
            .then((loaded) => {
                url = loaded;
                if (cancelled) URL.revokeObjectURL(loaded);
                else setStoredUrl(loaded);
            })
            .catch(() => !cancelled && setStoredUrl(null));
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
        };
    }, [microscope, version, src]);

    const shown = src !== undefined ? src : storedUrl;
    return (
        <Box sx={{ width, height, flexShrink: 0, borderRadius: 1.5, overflow: "hidden", border: `1px solid ${colors.border}`,
                   display: "flex", alignItems: "center", justifyContent: "center", bgcolor: colors.hover }}>
            {shown
                ? <img src={shown} alt={microscope ? `Photo of ${microscope.name}` : "Photo"}
                       style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <MicroscopeIcon size={Math.round(height * 0.45)} color={colors.muted} />}
        </Box>
    );
}

export function describeMicroscope(microscope: Microscope): string {
    return [microscope.model, microscope.detectors, microscope.energyFilter && `filter ${microscope.energyFilter}`,
        microscope.voltageKv && `${microscope.voltageKv} kV`, microscope.csMm && `Cs ${microscope.csMm} mm`]
        .filter(Boolean).join(" · ") || "—";
}

export default function MicroscopesPanel({ fieldSx, cardSx, cardHeaderSx, selectSx, menuPaperSx, colors,
                                           actionButtonSx, saveButtonSx }: PanelStyles) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = saveButtonSx ?? ROUNDED_BUTTON_SX;
    const [microscopes, setMicroscopes] = useState<Microscope[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Microscope | "new" | null>(null);
    const [deleting, setDeleting] = useState<Microscope | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setMicroscopes(await listMicroscopes());
        } catch (e: any) {
            setError(String(e?.message || "Failed to load the microscopes"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const remove = useCallback(async (microscope: Microscope) => {
        setDeleteBusy(true);
        try {
            await deleteMicroscope(microscope.id);
            toast.success("Microscope deleted.");
            setDeleting(null);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to delete the microscope"));
        } finally {
            setDeleteBusy(false);
        }
    }, [load]);

    if (loading && microscopes.length === 0 && !error) {
        return (
            <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
                <CircularProgress size={30} />
            </Box>
        );
    }

    return (
        <Stack spacing={1.75}>
            {error && <Alert severity="error">{error}</Alert>}
            <Card variant="outlined" sx={cardSx}>
                <CardHeader
                    title="Microscopes"
                    subheader="The facility's microscopes: what processing needs besides what their movies say (Cs, gain, where they write) and the calibrated pixel size at each magnification."
                    sx={cardHeaderSx}
                    action={
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                    disabled={loading} onClick={() => void load()}>
                                Reload
                            </Button>
                            <Button size="small" variant="contained" sx={saveSx} startIcon={<Plus size={15} />}
                                    onClick={() => setEditing("new")}>
                                New microscope
                            </Button>
                        </Stack>
                    }
                />
                <CardContent sx={{ pt: 2 }}>
                    <Stack spacing={1}>
                        {microscopes.length === 0 && <Alert severity="info">No microscopes yet.</Alert>}
                        {microscopes.map((microscope) => (
                            <Box key={microscope.id} sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.5 }}>
                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                                    <MicroscopePhoto microscope={microscope} width={96} height={72} colors={colors} />
                                    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 800, color: colors.text }}>
                                            {microscope.name}
                                            <Typography component="span" sx={{ fontSize: FACILITY_TEXT.badge, fontWeight: 600, color: colors.muted, ml: 1 }}>
                                                {STATUS_LABELS[microscope.status]}
                                                {microscope.sessionsEnabled ? " · sessions" : ""}
                                            </Typography>
                                        </Typography>
                                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                                            {describeMicroscope(microscope)}
                                        </Typography>
                                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                                            {microscope.pixelSizes.length
                                                ? "Calibrated: " + microscope.pixelSizes
                                                    .map((row) => `${row.magnification.toLocaleString("en-US")}× ${row.pixelSize} Å`).join(", ")
                                                : "No calibrated pixel sizes: the nominal ones of the movies are used"}
                                        </Typography>
                                    </Stack>
                                    </Stack>
                                    <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                        <Button size="small" variant="outlined" sx={actionSx} onClick={() => setEditing(microscope)}>
                                            Edit
                                        </Button>
                                        <Button size="small" variant="outlined" sx={{ ...actionSx, color: "error.main" }}
                                                onClick={() => setDeleting(microscope)}>
                                            Delete
                                        </Button>
                                    </Stack>
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                </CardContent>
            </Card>

            {deleting !== null && (
                <SettingsDialog
                    title="Delete microscope?"
                    description="Its calibrated pixel sizes go with it. Mark it out of service instead to keep its history."
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
                        <strong>{deleting.name}</strong> · {describeMicroscope(deleting)}
                    </Typography>
                </SettingsDialog>
            )}

            {editing !== null && (
                <MicroscopeDialog
                    microscope={editing === "new" ? null : editing}
                    colors={colors}
                    fieldSx={fieldSx}
                    selectSx={selectSx}
                    menuPaperSx={menuPaperSx}
                    actionButtonSx={actionSx}
                    saveButtonSx={saveSx}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        void load();
                    }}
                />
            )}
        </Stack>
    );
}

function MicroscopeDialog({ microscope, colors, fieldSx, selectSx, menuPaperSx, actionButtonSx, saveButtonSx, onClose,
                            onSaved }: {
    microscope: Microscope | null;
    colors: PanelStyles["colors"];
    fieldSx: any;
    selectSx: any;
    menuPaperSx: any;
    actionButtonSx: any;
    saveButtonSx: any;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState(microscope?.name ?? "");
    const [model, setModel] = useState(microscope?.model ?? "");
    const [status, setStatus] = useState<MicroscopeStatus>(microscope?.status ?? "operational");
    const [detectors, setDetectors] = useState(microscope?.detectors ?? "");
    const [energyFilter, setEnergyFilter] = useState(microscope?.energyFilter ?? "");
    const [acquisitionSoftware, setAcquisitionSoftware] = useState(microscope?.acquisitionSoftware ?? "");
    const [voltageKv, setVoltageKv] = useState(microscope?.voltageKv != null ? String(microscope.voltageKv) : "");
    const [csMm, setCsMm] = useState(microscope?.csMm != null ? String(microscope.csMm) : "");
    const [gainPath, setGainPath] = useState(microscope?.gainPath ?? "");
    const [gainFlip, setGainFlip] = useState<GainFlip>(microscope?.gainFlip ?? "none");
    const [gainRotation, setGainRotation] = useState<number>(microscope?.gainRotation ?? 0);
    const [offloadPath, setOffloadPath] = useState(microscope?.offloadPath ?? "");
    const [sessionsEnabled, setSessionsEnabled] = useState(microscope?.sessionsEnabled ?? false);
    const [notes, setNotes] = useState(microscope?.notes ?? "");
    const [pixelRows, setPixelRows] = useState<PixelRow[]>(() => pixelRowsOf(microscope));
    const [saving, setSaving] = useState(false);
    // The photo is changed with the rest, on Save: a file chosen, or the stored one removed
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoRemoved, setPhotoRemoved] = useState(false);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const photoInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!photoFile) {
            setPhotoPreview(null);
            return;
        }
        const url = URL.createObjectURL(photoFile);
        setPhotoPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [photoFile]);

    const hasPhoto = !!photoFile || (!photoRemoved && !!microscope?.photoUpdatedAt);

    const setPixelRow = (key: number, change: Partial<PixelRow>) =>
        setPixelRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));

    const save = async () => {
        const payload: MicroscopePayload = {
            name: name.trim(),
            model: model.trim(),
            status,
            detectors: detectors.trim(),
            energyFilter: energyFilter.trim(),
            acquisitionSoftware: acquisitionSoftware.trim(),
            voltageKv: optionalNumber(voltageKv),
            csMm: optionalNumber(csMm),
            gainPath: gainPath.trim(),
            gainFlip,
            gainRotation: gainRotation as MicroscopePayload["gainRotation"],
            offloadPath: offloadPath.trim(),
            sessionsEnabled,
            notes: notes.trim(),
            // Rows left empty are dropped; the API checks the rest
            pixelSizes: pixelRows
                .filter((row) => row.magnification.trim() || row.pixelSize.trim())
                .map((row) => ({ magnification: Number(row.magnification), pixelSize: Number(row.pixelSize) })),
        };
        setSaving(true);
        try {
            const saved = microscope ? await updateMicroscope(microscope.id, payload) : await createMicroscope(payload);
            if (photoFile) await uploadMicroscopePhoto(saved.id, photoFile);
            else if (photoRemoved && microscope?.photoUpdatedAt) await deleteMicroscopePhoto(saved.id);
            toast.success("Microscope saved.");
            onSaved();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the microscope"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsDialog
            title={microscope ? `Edit ${microscope.name}` : "New microscope"}
            description="Voltage, magnification and the nominal pixel size are read from each movie; the calibrated pixel size of its magnification replaces the nominal one."
            icon={<MicroscopeIcon size={20} color="white" />}
            confirmLabel="Save"
            busyLabel="Saving…"
            busy={saving}
            confirmDisabled={!name.trim()}
            maxWidth="md"
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => void save()}
            onClose={onClose}
        >
            <Stack spacing={1.5} sx={{ pt: 0.5 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <MicroscopePhoto microscope={photoRemoved ? null : microscope}
                                     src={photoFile ? photoPreview : photoRemoved ? null : undefined}
                                     width={160} height={120} colors={colors} />
                    <Stack spacing={1} alignItems="flex-start">
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, opacity: 0.75 }}>
                            A PNG, JPEG or WebP photo, up to 15 MB; it is kept reduced to 1600 px.
                        </Typography>
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<ImagePlus size={14} />}
                                    onClick={() => photoInputRef.current?.click()}>
                                {hasPhoto ? "Change photo" : "Add photo"}
                            </Button>
                            {hasPhoto && (
                                <Button size="small" variant="outlined" sx={{ ...actionButtonSx, color: "error.main" }}
                                        onClick={() => {
                                            setPhotoFile(null);
                                            setPhotoRemoved(true);
                                        }}>
                                    Remove photo
                                </Button>
                            )}
                        </Stack>
                        <input ref={photoInputRef} type="file" accept={PHOTO_TYPES} hidden aria-label="Photo file"
                               onChange={(e) => {
                                   const file = e.target.files?.[0];
                                   e.target.value = "";
                                   if (!file) return;
                                   setPhotoFile(file);
                                   setPhotoRemoved(false);
                               }} />
                    </Stack>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField sx={fieldSx} size="small" fullWidth label="Name" value={name}
                               onChange={(e) => setName(e.target.value)} />
                    <TextField sx={fieldSx} size="small" fullWidth label="Model" value={model}
                               onChange={(e) => setModel(e.target.value)} />
                    <FormControl size="small" fullWidth>
                        <InputLabel id="microscope-status-label">Status</InputLabel>
                        <Select labelId="microscope-status-label" label="Status" sx={selectSx}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }} value={status}
                                onChange={(e) => setStatus(e.target.value as MicroscopeStatus)}>
                            {(Object.keys(STATUS_LABELS) as MicroscopeStatus[]).map((value) => (
                                <MenuItem key={value} value={value}>{STATUS_LABELS[value]}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField sx={fieldSx} size="small" fullWidth label="Detectors" value={detectors}
                               placeholder="Falcon 4i, Ceta-D" onChange={(e) => setDetectors(e.target.value)} />
                    <TextField sx={fieldSx} size="small" fullWidth label="Energy filter" value={energyFilter}
                               placeholder="None" onChange={(e) => setEnergyFilter(e.target.value)} />
                    <TextField sx={fieldSx} size="small" fullWidth label="Acquisition software"
                               value={acquisitionSoftware} placeholder="EPU, Tomo5, SerialEM"
                               onChange={(e) => setAcquisitionSoftware(e.target.value)} />
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField sx={fieldSx} size="small" fullWidth label="Voltage (kV)" value={voltageKv}
                               helperText="Also read from each movie" inputProps={{ inputMode: "decimal" }}
                               onChange={(e) => setVoltageKv(e.target.value)} />
                    <TextField sx={fieldSx} size="small" fullWidth label="Spherical aberration, Cs (mm)" value={csMm}
                               helperText="Not in the movies' metadata" inputProps={{ inputMode: "decimal" }}
                               onChange={(e) => setCsMm(e.target.value)} />
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField sx={{ ...fieldSx, flex: 2 }} size="small" label="Gain reference" value={gainPath}
                               placeholder="/data/gains/*Talos*gain*.mrc" onChange={(e) => setGainPath(e.target.value)} />
                    <FormControl size="small" sx={{ flex: 1 }}>
                        <InputLabel id="microscope-gain-flip-label">Gain flip</InputLabel>
                        <Select labelId="microscope-gain-flip-label" label="Gain flip" sx={selectSx}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }} value={gainFlip}
                                onChange={(e) => setGainFlip(e.target.value as GainFlip)}>
                            {(Object.keys(GAIN_FLIP_LABELS) as GainFlip[]).map((value) => (
                                <MenuItem key={value} value={value}>{GAIN_FLIP_LABELS[value]}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ flex: 1 }}>
                        <InputLabel id="microscope-gain-rotation-label">Gain rotation</InputLabel>
                        <Select labelId="microscope-gain-rotation-label" label="Gain rotation" sx={selectSx}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }} value={gainRotation}
                                onChange={(e) => setGainRotation(Number(e.target.value))}>
                            {GAIN_ROTATIONS.map((value) => <MenuItem key={value} value={value}>{value}°</MenuItem>)}
                        </Select>
                    </FormControl>
                </Stack>
                <TextField sx={fieldSx} size="small" label="Folder the microscope writes to" value={offloadPath}
                           placeholder="/mnt/micros/talos_offload" onChange={(e) => setOffloadPath(e.target.value)} />
                <FormControlLabel
                    control={<Switch checked={sessionsEnabled} onChange={(e) => setSessionsEnabled(e.target.checked)} />}
                    label="Acquisition sessions on this microscope"
                />

                <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle, fontWeight: 700 }}>Calibrated pixel sizes</Typography>
                        <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Plus size={14} />}
                                onClick={() => setPixelRows((rows) => [...rows, {
                                    key: Math.max(0, ...rows.map((row) => row.key + 1)), magnification: "", pixelSize: "",
                                }])}>
                            Add magnification
                        </Button>
                    </Stack>
                    {pixelRows.length === 0 && (
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, opacity: 0.75 }}>
                            None: the nominal pixel size of each movie is used.
                        </Typography>
                    )}
                    <Stack spacing={1}>
                        {pixelRows.map((row) => (
                            <Stack key={row.key} direction="row" spacing={1} alignItems="center">
                                <TextField sx={fieldSx} size="small" label="Magnification (×)" value={row.magnification}
                                           inputProps={{ inputMode: "numeric", "aria-label": "Magnification" }}
                                           onChange={(e) => setPixelRow(row.key, { magnification: e.target.value })} />
                                <TextField sx={fieldSx} size="small" label="Pixel size (Å)" value={row.pixelSize}
                                           inputProps={{ inputMode: "decimal", "aria-label": "Pixel size" }}
                                           onChange={(e) => setPixelRow(row.key, { pixelSize: e.target.value })} />
                                <IconButton size="small" aria-label="Remove magnification"
                                            onClick={() => setPixelRows((rows) => rows.filter((other) => other.key !== row.key))}>
                                    <X size={16} />
                                </IconButton>
                            </Stack>
                        ))}
                    </Stack>
                </Box>

                <TextField sx={fieldSx} size="small" label="Notes" value={notes} multiline minRows={2}
                           onChange={(e) => setNotes(e.target.value)} />
            </Stack>
        </SettingsDialog>
    );
}
