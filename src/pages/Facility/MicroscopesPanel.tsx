import { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
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
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    Aperture, Camera, Eye, FileImage, FlipHorizontal, FolderInput, Hash, ImagePlus, Layers, LayoutGrid, Microscope as MicroscopeIcon,
    MonitorCog, Pencil, Plus, RefreshCw, RotateCcw as RotateIcon,
    Trash2, X, Zap,
} from "lucide-react";
import { useIsDark } from "@/context/ThemeContext";
import SettingsDialog, { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import { SettingsSection, choiceButtonsSx, sectionTint } from "@/pages/Settings/SettingsSection";
import { DialogPart, FactGrid, OptionRow, ViewDialog } from "./DialogParts";
import { FACILITY_TEXT, useFacilityStyles } from "./facilityStyles";
import { SessionFacts, type SessionFact } from "./SessionsPanel";
import { useConventionsPreview } from "./useConventionsPreview";
import toast from "react-hot-toast";

import {
    createMicroscope,
    deleteMicroscope,
    deleteMicroscopePhoto,
    fetchMicroscopePhotoUrl,
    listMicroscopes,
    updateMicroscope,
    uploadMicroscopePhoto,
    type Detector,
    type DetectorPayload,
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

const STATUS_COLORS: Record<MicroscopeStatus, string> = {
    operational: "#16a34a",
    maintenance: "#d97706",
    out_of_service: "#dc2626",
};

const GAIN_FLIP_LABELS: Record<GainFlip, string> = {
    none: "No flip",
    horizontal: "Flip left to right",
    vertical: "Flip upside down",
};

const GAIN_ROTATIONS = [0, 90, 180, 270] as const;

// A row of the calibration table while it is edited: text, so a half-typed number stays as typed
type PixelRow = { key: number; magnification: string; pixelSize: string };

// A detector while it is edited; id null until it is saved
type DetectorDraft = Omit<Detector, "id" | "pixelSizes" | "gainRotation"> & {
    key: number;
    id: number | null;
    gainRotation: number;
    pixelRows: PixelRow[];
};

function detectorDraftOf(detector: Detector | null, key: number): DetectorDraft {
    return {
        key,
        id: detector?.id ?? null,
        name: detector?.name ?? "",
        metadataName: detector?.metadataName ?? "",
        energyFiltered: detector?.energyFiltered ?? false,
        gainPath: detector?.gainPath ?? "",
        gainFlip: detector?.gainFlip ?? "none",
        gainRotation: detector?.gainRotation ?? 0,
        notes: detector?.notes ?? "",
        pixelRows: (detector?.pixelSizes ?? []).map((row, index) => ({
            key: index,
            magnification: String(row.magnification),
            pixelSize: String(row.pixelSize),
        })),
    };
}

function nextKey(items: { key: number }[]): number {
    return Math.max(0, ...items.map((item) => item.key + 1));
}

function isEmptyDraft(draft: DetectorDraft): boolean {
    return draft.id === null && !draft.name.trim() && !draft.metadataName.trim() && !draft.gainPath.trim()
        && !draft.notes.trim() && draft.pixelRows.every((row) => !row.magnification.trim() && !row.pixelSize.trim());
}

function detectorPayloadOf(draft: DetectorDraft): DetectorPayload {
    return {
        id: draft.id,
        name: draft.name.trim(),
        metadataName: draft.metadataName.trim(),
        energyFiltered: draft.energyFiltered,
        gainPath: draft.gainPath.trim(),
        gainFlip: draft.gainFlip,
        gainRotation: draft.gainRotation as Detector["gainRotation"],
        notes: draft.notes.trim(),
        // Rows left empty are dropped; the API checks the rest
        pixelSizes: draft.pixelRows
            .filter((row) => row.magnification.trim() || row.pixelSize.trim())
            .map((row) => ({ magnification: Number(row.magnification), pixelSize: Number(row.pixelSize) })),
    };
}

/** One detector's line in the list: its name and how its movies are calibrated. */
export function describeDetector(detector: Detector): string {
    const calibration = detector.pixelSizes.length
        ? detector.pixelSizes.map((row) => `${row.magnification.toLocaleString("en-US")}× ${row.pixelSize} Å`).join(", ")
        : "nominal pixel sizes";
    const named = detector.metadataName ? `${detector.name} (${detector.metadataName})` : detector.name;
    return `${named}${detector.energyFiltered ? ", energy filtered" : ""}: ${calibration}`;
}

function optionalNumber(text: string): number | null {
    const value = Number(text.trim());
    return text.trim() && Number.isFinite(value) ? value : null;
}

const PHOTO_TYPES = "image/png,image/jpeg,image/webp";

/** A small tinted label beside a name. */
function Pill({ color, children }: { color: string; children: string }) {
    return (
        <Box component="span" sx={{ px: 1, borderRadius: 10, flexShrink: 0, lineHeight: 1.7, fontSize: FACILITY_TEXT.badge,
                                    fontWeight: 700, color, bgcolor: `${color}1f`, whiteSpace: "nowrap" }}>
            {children}
        </Box>
    );
}

/** A microscope's detectors: each with its name in the movies, and its pixel size at each magnification. */
function DetectorList({ detectors, colors }: { detectors: Detector[]; colors: PanelStyles["colors"] }) {
    if (detectors.length === 0) {
        return (
            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                No detectors: the nominal pixel sizes of the movies are used
            </Typography>
        );
    }
    return (
        <Stack spacing={0.9}>
            {detectors.map((detector) => (
                <Stack key={detector.id} direction={{ xs: "column", md: "row" }} spacing={{ xs: 0.5, md: 1.25 }}
                       alignItems={{ md: "center" }} aria-label={`Detector ${detector.name}`} role="group">
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 220 }}>
                        <Camera size={15} style={{ color: colors.muted, flexShrink: 0 }} />
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text }}>
                            {detector.name}
                        </Typography>
                        {detector.metadataName && (
                            <Tooltip arrow title="Its name in the movies' metadata">
                                <Typography component="span" sx={{ fontSize: FACILITY_TEXT.note, fontFamily: "monospace", color: colors.muted }}>
                                    {detector.metadataName}
                                </Typography>
                            </Tooltip>
                        )}
                        {detector.energyFiltered && <Pill color="#7c3aed">energy filtered</Pill>}
                    </Stack>
                    <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.75}>
                        {detector.pixelSizes.length === 0 ? (
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>nominal pixel sizes</Typography>
                        ) : detector.pixelSizes.map((row) => (
                            <Box key={row.magnification} component="span"
                                 sx={{ px: 1, borderRadius: 1.5, border: `1px solid ${colors.border}`, bgcolor: colors.surface,
                                       fontSize: FACILITY_TEXT.note, color: colors.text, whiteSpace: "nowrap", lineHeight: 1.8 }}>
                                {row.magnification.toLocaleString("en-US")}× <Box component="span" sx={{ color: colors.muted }}>→</Box>{" "}
                                <strong>{row.pixelSize} Å</strong>
                            </Box>
                        ))}
                        {detector.gainPath && (
                            <Tooltip arrow title={detector.gainPath}>
                                <Box component="span" sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, lineHeight: 1.8 }}>
                                    · gain reference set
                                </Box>
                            </Tooltip>
                        )}
                    </Stack>
                </Stack>
            ))}
        </Stack>
    );
}

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
    return [microscope.model, microscope.detectors.map((detector) => detector.name).join(", "), microscope.energyFilter && `filter ${microscope.energyFilter}`,
        microscope.voltageKv && `${microscope.voltageKv} kV`, microscope.csMm && `Cs ${microscope.csMm} mm`]
        .filter(Boolean).join(" · ") || "—";
}

export default function MicroscopesPanel({ fieldSx, selectSx, menuPaperSx, colors,
                                           actionButtonSx, saveButtonSx }: PanelStyles) {
    const isDark = useIsDark();
    const sectionColors = { ...useFacilityStyles().colors, ...colors };
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = saveButtonSx ?? ROUNDED_BUTTON_SX;
    const [microscopes, setMicroscopes] = useState<Microscope[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Microscope | "new" | null>(null);
    const [deleting, setDeleting] = useState<Microscope | null>(null);
    const [viewing, setViewing] = useState<Microscope | null>(null);
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

    return (
        <Stack spacing={2}>
            <SettingsSection
                plain
                icon={<MicroscopeIcon size={19} />}
                title="Microscopes"
                subtitle="What processing needs besides what the movies say (Cs, gain, where they are written) and the calibrated pixel size at each magnification."
                colors={sectionColors}
                isDarkMode={isDark}
                actions={
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
            >
                <Stack spacing={1.5}>
                    {error && <Alert severity="error">{error}</Alert>}
                    {loading && microscopes.length === 0 && !error && (
                        <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>
                    )}
                    {!loading && microscopes.length === 0 && !error && (
                        <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 3, textAlign: "center" }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>No microscopes yet.</Typography>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.5 }}>
                                Add one with New microscope: sessions, bookings and processing need it.
                            </Typography>
                        </Box>
                    )}
                    {microscopes.length > 0 && (
                        <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle, fontWeight: 700, color: colors.text }}>
                            {microscopes.length === 1 ? "1 microscope" : `${microscopes.length} microscopes`}
                        </Typography>
                    )}
                    {microscopes.map((microscope) => {
                        const facts: SessionFact[] = [
                            { icon: <MicroscopeIcon size={15} />, text: microscope.model ?? "" },
                            { icon: <Zap size={15} />, text: microscope.voltageKv ? `${microscope.voltageKv} kV` : "" },
                            { icon: <Aperture size={15} />, text: microscope.csMm ? `Cs ${microscope.csMm} mm` : "" },
                            { icon: <Layers size={15} />, text: microscope.energyFilter ? `filter ${microscope.energyFilter}` : "" },
                            { icon: <MonitorCog size={15} />, text: microscope.acquisitionSoftware ?? "" },
                        ];
                        return (
                            <Box key={microscope.id} data-testid={`microscope-${microscope.id}`}
                                 sx={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${STATUS_COLORS[microscope.status]}`,
                                       borderRadius: 2.5, bgcolor: sectionColors.card, overflow: "hidden" }}>
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ px: 2, py: 1.5 }}
                                       alignItems={{ sm: "flex-start" }}>
                                    <MicroscopePhoto microscope={microscope} width={128} height={96} colors={colors} />
                                    <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
                                        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle + 1, fontWeight: 800, color: colors.text }}>
                                                {microscope.name}
                                            </Typography>
                                            <Pill color={STATUS_COLORS[microscope.status]}>{STATUS_LABELS[microscope.status]}</Pill>
                                            {microscope.sessionsEnabled && <Pill color="#2563eb">Runs sessions</Pill>}
                                        </Stack>
                                        <SessionFacts facts={facts} colors={colors} label="About the microscope" />
                                        {microscope.offloadPath && (
                                            <Stack direction="row" spacing={0.6} alignItems="center" sx={{ color: colors.muted, minWidth: 0 }}>
                                                <FolderInput size={15} style={{ flexShrink: 0 }} />
                                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontFamily: "monospace", color: colors.text,
                                                                  wordBreak: "break-all" }}>
                                                    {microscope.offloadPath}
                                                </Typography>
                                            </Stack>
                                        )}
                                    </Stack>
                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                                        <Button size="small" variant="outlined" sx={actionSx} startIcon={<Eye size={14} />}
                                                aria-label={`View ${microscope.name}`} onClick={() => setViewing(microscope)}>
                                            View
                                        </Button>
                                        <Button size="small" variant="outlined" sx={actionSx} startIcon={<Pencil size={14} />}
                                                onClick={() => setEditing(microscope)}>
                                            Edit
                                        </Button>
                                        <Tooltip arrow title="Delete">
                                            <IconButton size="small" aria-label={`Delete ${microscope.name}`} sx={{ color: "#dc2626" }}
                                                        onClick={() => setDeleting(microscope)}>
                                                <Trash2 size={17} />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                </Stack>
                                <Box sx={{ borderTop: `1px solid ${colors.border}`, bgcolor: colors.hover, px: 2, py: 1.25 }}>
                                    <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 800, color: colors.muted,
                                                      textTransform: "uppercase", letterSpacing: 0.5, mb: 0.75 }}>
                                        Detectors
                                    </Typography>
                                    <DetectorList detectors={microscope.detectors} colors={colors} />
                                </Box>
                            </Box>
                        );
                    })}
                </Stack>
            </SettingsSection>

            {deleting !== null && (
                <SettingsDialog
                    title="Delete microscope?"
                    description="Its detectors and their calibrated pixel sizes go with it. This cannot be undone."
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
                        <Stack direction="row" spacing={1.5} alignItems="center"
                               sx={{ border: `1px solid ${colors.border}`, borderLeft: "4px solid #dc2626", borderRadius: 2, p: 1.25 }}>
                            <MicroscopePhoto microscope={deleting} width={64} height={48} colors={colors} />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 800 }}>{deleting.name}</Typography>
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>{describeMicroscope(deleting)}</Typography>
                            </Box>
                        </Stack>
                        <Alert severity="info" sx={{ fontSize: FACILITY_TEXT.note }}>
                            To keep its history, mark it Out of service instead: Edit, then Status.
                        </Alert>
                    </Stack>
                </SettingsDialog>
            )}

            {viewing !== null && (
                <MicroscopeView microscope={viewing} colors={colors} onClose={() => setViewing(null)} />
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

/** A microscope to look at, not to change: what it is, where it writes, and each detector's calibration and gain. */
function MicroscopeView({ microscope, colors, onClose }: {
    microscope: Microscope;
    colors: PanelStyles["colors"];
    onClose: () => void;
}) {
    const tint = sectionTint(useIsDark());
    return (
        <ViewDialog icon={<MicroscopeIcon size={20} color="white" />} title={microscope.name}
                    subtitle={microscope.model || undefined} onClose={onClose}>
            <DialogPart icon={<MicroscopeIcon size={18} />} title="The microscope" tint={tint} colors={colors}
                        action={
                            <Stack direction="row" spacing={0.75}>
                                <Pill color={STATUS_COLORS[microscope.status]}>{STATUS_LABELS[microscope.status]}</Pill>
                                {microscope.sessionsEnabled && <Pill color="#2563eb">Runs sessions</Pill>}
                            </Stack>
                        }>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ sm: "flex-start" }}>
                    <MicroscopePhoto microscope={microscope} width={220} height={165} colors={colors} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <FactGrid colors={colors} facts={[
                            [<Zap size={15} />, "Voltage", microscope.voltageKv ? `${microscope.voltageKv} kV` : null],
                            [<Aperture size={15} />, "Spherical aberration", microscope.csMm ? `Cs ${microscope.csMm} mm` : null],
                            [<Layers size={15} />, "Energy filter", microscope.energyFilter || "None"],
                            [<MonitorCog size={15} />, "Acquisition software", microscope.acquisitionSoftware],
                        ]} />
                        {microscope.notes && (
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, whiteSpace: "pre-wrap", mt: 1.5 }}>
                                {microscope.notes}
                            </Typography>
                        )}
                    </Box>
                </Stack>
            </DialogPart>

            <DialogPart icon={<FolderInput size={18} />} title="Sessions and folders" tint={tint} colors={colors}>
                <FactGrid colors={colors} facts={[
                    [<FolderInput size={15} />, "Folder it writes to", microscope.offloadPath
                        ? <Box component="span" sx={{ fontFamily: "monospace" }}>{microscope.offloadPath}</Box> : "Not set"],
                    [<Hash size={15} />, "Code in names", microscope.code || microscope.name],
                    [<LayoutGrid size={15} />, "Grids in the autoloader", String(microscope.gridSlots)],
                    [<FolderInput size={15} />, "DATA folder", <Box component="span" sx={{ fontFamily: "monospace" }}>{microscope.dataFolderPattern}</Box>],
                    [<FolderInput size={15} />, "ATLAS folder", microscope.atlasFolderPattern
                        ? <Box component="span" sx={{ fontFamily: "monospace" }}>{microscope.atlasFolderPattern}</Box> : "No atlas folder"],
                ]} />
            </DialogPart>

            <DialogPart icon={<Camera size={18} />} title="Detectors" tint={tint} colors={colors}
                        subtitle={microscope.detectors.length ? undefined : "None: the nominal pixel size of each movie is used."}>
                {microscope.detectors.map((detector) => (
                    <Box key={detector.id} role="group" aria-label={`Detector ${detector.name}`}
                         sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, overflow: "hidden" }}>
                        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap"
                               sx={{ bgcolor: colors.hover, px: 1.5, py: 1, borderBottom: `1px solid ${colors.border}` }}>
                            <Camera size={16} style={{ color: colors.muted }} />
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 800, color: colors.text }}>{detector.name}</Typography>
                            {detector.metadataName && (
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, fontFamily: "monospace", color: colors.muted }}>
                                    {detector.metadataName}
                                </Typography>
                            )}
                            {detector.energyFiltered && <Pill color="#7c3aed">energy filtered</Pill>}
                        </Stack>
                        <Stack spacing={1.5} sx={{ p: 1.5 }}>
                            <FactGrid colors={colors} columns={3} facts={[
                                [<FileImage size={15} />, "Gain reference", detector.gainPath
                                    ? <Box component="span" sx={{ fontFamily: "monospace" }}>{detector.gainPath}</Box> : "None"],
                                [<RotateIcon size={15} />, "Gain rotation", detector.gainRotation ? `${detector.gainRotation}° counter-clockwise` : "None"],
                                [<FlipHorizontal size={15} />, "Gain flip", GAIN_FLIP_LABELS[detector.gainFlip]],
                            ]} />
                            <Box>
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mb: 0.75 }}>Calibrated pixel sizes</Typography>
                                {detector.pixelSizes.length === 0 ? (
                                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text }}>None: the nominal ones are used.</Typography>
                                ) : (
                                    <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: 1.5, overflow: "hidden", maxWidth: 360 }}>
                                        <Stack direction="row" sx={{ bgcolor: colors.hover, px: 1.25, py: 0.5 }}>
                                            <Typography sx={{ flex: 1, fontSize: FACILITY_TEXT.note, fontWeight: 700, color: colors.muted }}>Magnification</Typography>
                                            <Typography sx={{ flex: 1, fontSize: FACILITY_TEXT.note, fontWeight: 700, color: colors.muted }}>Pixel size</Typography>
                                        </Stack>
                                        {[...detector.pixelSizes].sort((a, b) => a.magnification - b.magnification).map((row) => (
                                            <Stack key={row.magnification} direction="row"
                                                   sx={{ px: 1.25, py: 0.5, borderTop: `1px solid ${colors.border}` }}>
                                                <Typography sx={{ flex: 1, fontSize: FACILITY_TEXT.itemLine, color: colors.text }}>
                                                    {row.magnification.toLocaleString("en-US")}×
                                                </Typography>
                                                <Typography sx={{ flex: 1, fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text }}>
                                                    {row.pixelSize} Å
                                                </Typography>
                                            </Stack>
                                        ))}
                                    </Box>
                                )}
                            </Box>
                            {detector.notes && (
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, whiteSpace: "pre-wrap" }}>{detector.notes}</Typography>
                            )}
                        </Stack>
                    </Box>
                ))}
            </DialogPart>
        </ViewDialog>
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
    // A new microscope starts with one detector to fill
    const [detectors, setDetectors] = useState<DetectorDraft[]>(() =>
        microscope ? microscope.detectors.map((detector, index) => detectorDraftOf(detector, index)) : [detectorDraftOf(null, 0)]);
    const [energyFilter, setEnergyFilter] = useState(microscope?.energyFilter ?? "");
    const [acquisitionSoftware, setAcquisitionSoftware] = useState(microscope?.acquisitionSoftware ?? "");
    const [voltageKv, setVoltageKv] = useState(microscope?.voltageKv != null ? String(microscope.voltageKv) : "");
    const [csMm, setCsMm] = useState(microscope?.csMm != null ? String(microscope.csMm) : "");
    const [offloadPath, setOffloadPath] = useState(microscope?.offloadPath ?? "");
    const [code, setCode] = useState(microscope?.code ?? "");
    const [gridSlots, setGridSlots] = useState(String(microscope?.gridSlots ?? 12));
    const [dataFolderPattern, setDataFolderPattern] = useState(microscope?.dataFolderPattern ?? "{session}_DATA_{n:02d}");
    const [atlasFolderPattern, setAtlasFolderPattern] = useState(microscope?.atlasFolderPattern ?? "{session}_ATLAS");
    const folders = useConventionsPreview({ dataFolderPattern, atlasFolderPattern, microscopeCode: code || name });
    const [sessionsEnabled, setSessionsEnabled] = useState(microscope?.sessionsEnabled ?? false);
    const [notes, setNotes] = useState(microscope?.notes ?? "");
    const [saving, setSaving] = useState(false);
    // A detector with what was set on it, waiting for its removal to be confirmed
    const [removingDetector, setRemovingDetector] = useState<DetectorDraft | null>(null);
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

    const setDetector = (key: number, change: Partial<DetectorDraft>) =>
        setDetectors((drafts) => drafts.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)));

    const save = async () => {
        const payload: MicroscopePayload = {
            name: name.trim(),
            model: model.trim(),
            status,
            energyFilter: energyFilter.trim(),
            acquisitionSoftware: acquisitionSoftware.trim(),
            voltageKv: optionalNumber(voltageKv),
            csMm: optionalNumber(csMm),
            offloadPath: offloadPath.trim(),
            sessionsEnabled,
            code: code.trim(),
            gridSlots: Number(gridSlots) || 12,
            dataFolderPattern: dataFolderPattern.trim(),
            atlasFolderPattern: atlasFolderPattern.trim(),
            notes: notes.trim(),
            // A new detector left untouched is dropped
            detectors: detectors.filter((draft) => !isEmptyDraft(draft)).map(detectorPayloadOf),
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

    const isDark = useIsDark();
    const tint = sectionTint(isDark);
    const primary = useFacilityStyles().colors.primary;
    const helper = { sx: { fontSize: 13.5 } };

    return (
        <SettingsDialog
            title={microscope ? `Edit ${microscope.name}` : "New microscope"}
            description="Voltage, magnification and pixel size are read from each movie; what the movies do not say is kept here."
            icon={<MicroscopeIcon size={20} color="white" />}
            confirmLabel="Save"
            busyLabel="Saving…"
            busy={saving}
            confirmDisabled={!name.trim()}
            maxWidth="md"
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            closeButton
            onConfirm={() => void save()}
            onClose={onClose}
        >
            <Stack spacing={2} sx={{ pt: 0.5 }}>
                <DialogPart icon={<MicroscopeIcon size={18} />} title="The microscope" tint={tint} colors={colors}
                            subtitle="Its name, a photo, and whether it can be used now.">
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                        <MicroscopePhoto microscope={photoRemoved ? null : microscope}
                                         src={photoFile ? photoPreview : photoRemoved ? null : undefined}
                                         width={160} height={120} colors={colors} />
                        <Stack spacing={1} alignItems="flex-start">
                            <Stack direction="row" spacing={1}>
                                <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<ImagePlus size={14} />}
                                        onClick={() => photoInputRef.current?.click()}>
                                    {hasPhoto ? "Change photo" : "Add photo"}
                                </Button>
                                {hasPhoto && (
                                    <Button size="small" variant="outlined" sx={{ ...actionButtonSx, color: "error.main" }}
                                            startIcon={<Trash2 size={14} />}
                                            onClick={() => {
                                                setPhotoFile(null);
                                                setPhotoRemoved(true);
                                            }}>
                                        Remove photo
                                    </Button>
                                )}
                            </Stack>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                PNG, JPEG or WebP, up to 15 MB. Kept on Save.
                            </Typography>
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
                        <TextField sx={fieldSx} size="small" fullWidth label="Name" value={name} placeholder="Krios G5"
                                   onChange={(e) => setName(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Model" value={model} placeholder="Titan Krios G4"
                                   onChange={(e) => setModel(e.target.value)} />
                    </Stack>
                    <Box>
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text, mb: 0.75 }}>Status</Typography>
                        <ToggleButtonGroup exclusive size="small" value={status} aria-label="Status"
                                           onChange={(_, value) => value && setStatus(value as MicroscopeStatus)}
                                           sx={choiceButtonsSx({ ...colors, card: "", primary }, isDark)}>
                            {(Object.keys(STATUS_LABELS) as MicroscopeStatus[]).map((value) => (
                                <ToggleButton key={value} value={value}>
                                    <Box component="span" sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: STATUS_COLORS[value], mr: 1 }} />
                                    {STATUS_LABELS[value]}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    </Box>
                    <TextField sx={fieldSx} size="small" label="Notes" value={notes} multiline minRows={2}
                               onChange={(e) => setNotes(e.target.value)} />
                </DialogPart>

                <DialogPart icon={<Zap size={18} />} title="Optics" tint={tint} colors={colors}
                            subtitle="What processing needs from the microscope itself.">
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={fieldSx} size="small" fullWidth label="Voltage (kV)" value={voltageKv} placeholder="300"
                                   helperText="Also read from each movie" FormHelperTextProps={helper} inputProps={{ inputMode: "decimal" }}
                                   onChange={(e) => setVoltageKv(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Spherical aberration, Cs (mm)" value={csMm} placeholder="2.7"
                                   helperText="Not in the movies' metadata" FormHelperTextProps={helper} inputProps={{ inputMode: "decimal" }}
                                   onChange={(e) => setCsMm(e.target.value)} />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={fieldSx} size="small" fullWidth label="Energy filter" value={energyFilter}
                                   placeholder="None" onChange={(e) => setEnergyFilter(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Acquisition software"
                                   value={acquisitionSoftware} placeholder="EPU, Tomo5, SerialEM"
                                   onChange={(e) => setAcquisitionSoftware(e.target.value)} />
                    </Stack>
                </DialogPart>

                <DialogPart icon={<FolderInput size={18} />} title="Sessions and folders" tint={tint} colors={colors}
                            subtitle="Where the microscope writes, and how a session's folders are named.">
                    <OptionRow title="Acquisition sessions on this microscope"
                               description="Sessions can be planned on it, and its folders are watched while they acquire."
                               checked={sessionsEnabled} onChange={setSessionsEnabled} colors={colors} />
                    <TextField sx={fieldSx} size="small" label="Folder the microscope writes to" value={offloadPath}
                               placeholder="/mnt/micros/krios_offload" inputProps={{ style: { fontFamily: "monospace" } }}
                               helperText="Its offload: each DATA's folder is made here" FormHelperTextProps={helper}
                               onChange={(e) => setOffloadPath(e.target.value)} />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={fieldSx} size="small" fullWidth label="Code in names" value={code}
                                   placeholder="KRIOS" helperText="{microscope} in session and folder names; empty: its name"
                                   FormHelperTextProps={helper} onChange={(e) => setCode(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Grids in the autoloader" value={gridSlots}
                                   inputProps={{ inputMode: "numeric" }} helperText="A session's DATA are positions 1 to this"
                                   FormHelperTextProps={helper} onChange={(e) => setGridSlots(e.target.value)} />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={fieldSx} size="small" fullWidth label="DATA folder" value={dataFolderPattern}
                                   inputProps={{ style: { fontFamily: "monospace" } }}
                                   helperText="{session}, {n} (the grid's position, e.g. {n:02d}), {microscope}"
                                   FormHelperTextProps={helper} onChange={(e) => setDataFolderPattern(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="ATLAS folder" value={atlasFolderPattern}
                                   inputProps={{ style: { fontFamily: "monospace" } }} helperText="Empty: no atlas folder"
                                   FormHelperTextProps={helper} onChange={(e) => setAtlasFolderPattern(e.target.value)} />
                    </Stack>
                    {folders.error
                        ? <Alert severity="warning">{folders.error}</Alert>
                        : folders.examples && (
                            <Box sx={{ borderRadius: 2, bgcolor: tint, px: 1.5, py: 1.1 }}>
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mb: 0.75 }}>
                                    For a session named <Box component="span" sx={{ fontFamily: "monospace", color: colors.text }}>{folders.examples.session}</Box>, the folders are:
                                </Typography>
                                <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.75}>
                                    {[folders.examples.atlas, ...folders.examples.data].filter(Boolean).map((folder) => (
                                        <Box key={folder} component="span"
                                             sx={{ px: 1, borderRadius: 1.5, border: `1px solid ${colors.border}`, bgcolor: colors.surface,
                                                   fontFamily: "monospace", fontSize: FACILITY_TEXT.note, color: colors.text, lineHeight: 1.8 }}>
                                            {folder}
                                        </Box>
                                    ))}
                                    <Box component="span" sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, lineHeight: 1.8 }}>…</Box>
                                </Stack>
                            </Box>
                        )}
                </DialogPart>

                <DialogPart icon={<Camera size={18} />} title="Detectors" tint={tint} colors={colors}
                            subtitle="Each movie names its detector; its calibrated pixel size at the magnification replaces the nominal one."
                            action={
                                <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Plus size={14} />}
                                        onClick={() => setDetectors((drafts) => [...drafts, detectorDraftOf(null, nextKey(drafts))])}>
                                    Add detector
                                </Button>
                            }>
                    {detectors.length === 0 && (
                        <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 2, textAlign: "center" }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                None: the nominal pixel size of each movie is used.
                            </Typography>
                        </Box>
                    )}
                    {detectors.map((draft) => (
                        <DetectorEditor key={draft.key} draft={draft} colors={colors} fieldSx={fieldSx}
                                        selectSx={selectSx} menuPaperSx={menuPaperSx}
                                        onChange={(change) => setDetector(draft.key, change)}
                                        onRemove={() => (draft.id !== null || !isEmptyDraft(draft)
                                            ? setRemovingDetector(draft)
                                            : setDetectors((drafts) => drafts.filter((other) => other.key !== draft.key)))} />
                    ))}
                </DialogPart>
            </Stack>
            {removingDetector && (() => {
                const rows = removingDetector.pixelRows.filter((row) => row.magnification.trim() || row.pixelSize.trim());
                const label = removingDetector.name.trim() || "this detector";
                return (
                    <SettingsDialog
                        title={`Remove ${label}?`}
                        description="Its calibration and gain reference go with it when you save the microscope. Until then, Cancel keeps everything as it was."
                        icon={<Trash2 size={20} color="#fca5a5" />}
                        confirmLabel="Remove the detector"
                        destructive
                        maxWidth="xs"
                        actionButtonSx={actionButtonSx}
                        closeButton
                        onConfirm={() => {
                            setDetectors((drafts) => drafts.filter((other) => other.key !== removingDetector.key));
                            setRemovingDetector(null);
                        }}
                        onClose={() => setRemovingDetector(null)}
                    >
                        <Stack spacing={1} sx={{ border: `1px solid ${colors.border}`, borderLeft: "4px solid #dc2626", borderRadius: 2, px: 1.5, py: 1.25 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center">
                                <Camera size={16} style={{ color: colors.muted }} />
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 800 }}>{removingDetector.name || "No name"}</Typography>
                                {removingDetector.metadataName && (
                                    <Typography sx={{ fontSize: FACILITY_TEXT.note, fontFamily: "monospace", color: colors.muted }}>
                                        {removingDetector.metadataName}
                                    </Typography>
                                )}
                            </Stack>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                {rows.length ? `${rows.length} calibrated pixel size${rows.length === 1 ? "" : "s"}: `
                                    + rows.map((row) => `${row.magnification}× → ${row.pixelSize} Å`).join(", ")
                                    : "No calibrated pixel sizes"}
                                {removingDetector.gainPath.trim() ? "; a gain reference" : ""}
                            </Typography>
                        </Stack>
                    </SettingsDialog>
                );
            })()}
        </SettingsDialog>
    );
}


function DetectorEditor({ draft, colors, fieldSx, selectSx, menuPaperSx, onChange, onRemove }: {
    draft: DetectorDraft;
    colors: PanelStyles["colors"];
    fieldSx: any;
    selectSx: any;
    menuPaperSx: any;
    onChange: (change: Partial<DetectorDraft>) => void;
    onRemove: () => void;
}) {
    const setPixelRow = (key: number, change: Partial<PixelRow>) =>
        onChange({ pixelRows: draft.pixelRows.map((row) => (row.key === key ? { ...row, ...change } : row)) });
    const label = draft.name.trim() || "New detector";

    return (
        <Box role="group" aria-label={`Detector ${label}`}
             sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, overflow: "hidden" }}>
            <Box sx={{ bgcolor: colors.hover, px: 1.5, py: 1.25, borderBottom: `1px solid ${colors.border}` }}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems={{ md: "center" }}>
                    <Camera size={18} style={{ color: colors.muted, flexShrink: 0 }} />
                    <TextField sx={fieldSx} size="small" fullWidth label="Detector" value={draft.name}
                               placeholder="Falcon 4i" onChange={(e) => onChange({ name: e.target.value })} />
                    <TextField sx={fieldSx} size="small" fullWidth label="Name in the movies' metadata"
                               value={draft.metadataName} placeholder="BM-Falcon"
                               inputProps={{ style: { fontFamily: "monospace" } }}
                               onChange={(e) => onChange({ metadataName: e.target.value })} />
                    <FormControlLabel
                        sx={{ flexShrink: 0, mr: 0, "& .MuiFormControlLabel-label": { fontSize: FACILITY_TEXT.itemLine } }}
                        control={<Switch checked={draft.energyFiltered}
                                         onChange={(e) => onChange({ energyFiltered: e.target.checked })} />}
                        label="Behind the energy filter"
                    />
                    <Tooltip arrow title="Remove the detector">
                        <IconButton size="small" aria-label={`Remove detector ${label}`} sx={{ color: "#dc2626" }} onClick={onRemove}>
                            <Trash2 size={17} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>
            <Stack spacing={2} sx={{ p: 1.5 }}>
                <Box>
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text, mb: 1 }}>Gain reference</Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={{ ...fieldSx, flex: 2 }} size="small" label="Gain reference" value={draft.gainPath}
                                   placeholder="/data/gains/*Talos*gain*.mrc" inputProps={{ style: { fontFamily: "monospace" } }}
                                   onChange={(e) => onChange({ gainPath: e.target.value })} />
                        <FormControl size="small" sx={{ flex: 1 }}>
                            <InputLabel id={`detector-${draft.key}-gain-flip-label`}>Gain flip</InputLabel>
                            <Select labelId={`detector-${draft.key}-gain-flip-label`} label="Gain flip" sx={selectSx}
                                    MenuProps={{ PaperProps: { sx: menuPaperSx } }} value={draft.gainFlip}
                                    onChange={(e) => onChange({ gainFlip: e.target.value as GainFlip })}>
                                {(Object.keys(GAIN_FLIP_LABELS) as GainFlip[]).map((value) => (
                                    <MenuItem key={value} value={value}>{GAIN_FLIP_LABELS[value]}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ flex: 1 }}>
                            <InputLabel id={`detector-${draft.key}-gain-rotation-label`}>Gain rotation</InputLabel>
                            <Select labelId={`detector-${draft.key}-gain-rotation-label`} label="Gain rotation" sx={selectSx}
                                    MenuProps={{ PaperProps: { sx: menuPaperSx } }} value={draft.gainRotation}
                                    onChange={(e) => onChange({ gainRotation: Number(e.target.value) })}>
                                {GAIN_ROTATIONS.map((value) => <MenuItem key={value} value={value}>{value ? `${value}° counter-clockwise` : "None"}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Stack>
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.75 }}>
                        How the gain reference lies against the movies: the movie alignment rotates it counter-clockwise, then flips it.
                    </Typography>
                </Box>

                <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text }}>Calibrated pixel sizes</Typography>
                        <Button size="small" variant="text" sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note }}
                                startIcon={<Plus size={14} />}
                                onClick={() => onChange({ pixelRows: [...draft.pixelRows, {
                                    key: nextKey(draft.pixelRows), magnification: "", pixelSize: "",
                                }] })}>
                            Add magnification
                        </Button>
                    </Stack>
                    {draft.pixelRows.length === 0 && (
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                            None: the nominal pixel size of each movie is used.
                        </Typography>
                    )}
                    <Stack spacing={1}>
                        {draft.pixelRows.map((row) => (
                            <Stack key={row.key} direction="row" spacing={1} alignItems="center">
                                <TextField sx={{ ...fieldSx, width: 200 }} size="small" label="Magnification (×)" value={row.magnification}
                                           placeholder="105000"
                                           inputProps={{ inputMode: "numeric", "aria-label": "Magnification" }}
                                           onChange={(e) => setPixelRow(row.key, { magnification: e.target.value })} />
                                <Typography sx={{ color: colors.muted }}>→</Typography>
                                <TextField sx={{ ...fieldSx, width: 170 }} size="small" label="Pixel size (Å)" value={row.pixelSize}
                                           placeholder="0.83"
                                           inputProps={{ inputMode: "decimal", "aria-label": "Pixel size" }}
                                           onChange={(e) => setPixelRow(row.key, { pixelSize: e.target.value })} />
                                <Tooltip arrow title="Remove the magnification">
                                    <IconButton size="small" aria-label="Remove magnification"
                                                onClick={() => onChange({ pixelRows: draft.pixelRows.filter((other) => other.key !== row.key) })}>
                                        <X size={16} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        ))}
                    </Stack>
                </Box>
                <TextField sx={fieldSx} size="small" label="Detector notes" value={draft.notes}
                           onChange={(e) => onChange({ notes: e.target.value })} />
            </Stack>
        </Box>
    );
}
