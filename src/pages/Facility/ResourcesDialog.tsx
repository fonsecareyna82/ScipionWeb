import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import {
    Alert, Box, Button, FormControl, IconButton, InputLabel, MenuItem, Select, Stack, TextField, ToggleButton,
    ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import {
    ArrowLeft, Ban, Boxes, Clock, Microscope as MicroscopeIcon, Pencil, Plus, Receipt, Settings2, ShieldCheck, Sunrise, Timer,
    Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

import SettingsDialog, { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import {
    createResource, deleteResource, listMicroscopes, listResources, updateResource,
    type FacilityResource, type Microscope, type ResourcePayload, type ResourceUnit,
} from "@/api/facility";
import { useIsDark } from "@/context/ThemeContext";
import { choiceButtonsSx, sectionTint } from "@/pages/Settings/SettingsSection";
import { FACILITY_TEXT, useFacilityStyles } from "./facilityStyles";
import { DialogPart, OptionRow } from "./DialogParts";

type PanelStyles = {
    fieldSx: any;
    selectSx?: any;
    menuPaperSx?: any;
    actionButtonSx?: any;
    saveButtonSx?: any;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};

const PALETTE = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#dc2626"];

/** A resource's colour in the calendar: its own, else one of the palette by its id. */
export function resourceColor(resource: Pick<FacilityResource, "id" | "color"> | undefined | null): string {
    if (!resource) return PALETTE[0];
    return resource.color || PALETTE[resource.id % PALETTE.length];
}

function Pill({ color, children }: { color: string; children: ReactNode }) {
    return (
        <Box component="span" sx={{ px: 1, borderRadius: 10, lineHeight: 1.7, fontSize: FACILITY_TEXT.badge, fontWeight: 700,
                                    whiteSpace: "nowrap", color, bgcolor: `${color}1f` }}>
            {children}
        </Box>
    );
}

const UNIT_LABELS: Record<ResourceUnit, string> = {
    session: "By session (whole days)",
    hour: "By hour",
    half_hour: "By half hour",
    service: "As a service",
};

const EMPTY: ResourcePayload = {
    name: "", microscopeId: null, color: "", unit: "session", minHours: null, maxHours: null, dayStart: "09:00",
    requiresAuthorization: false, active: true, notes: "",
};

type Draft = Omit<ResourcePayload, "minHours" | "maxHours"> & { minHours: string; maxHours: string };

function draftOf(resource: ResourcePayload): Draft {
    return { ...resource, minHours: resource.minHours == null ? "" : String(resource.minHours),
             maxHours: resource.maxHours == null ? "" : String(resource.maxHours) };
}

/** What can be booked: each resource with how it is charged, how long it is booked and when its day starts. */
export default function ResourcesDialog({ fieldSx, selectSx, menuPaperSx, colors, actionButtonSx, saveButtonSx,
                                          onClose }: PanelStyles & { onClose: () => void }) {
    const [resources, setResources] = useState<FacilityResource[] | null>(null);
    const [microscopes, setMicroscopes] = useState<Microscope[]>([]);
    const [editing, setEditing] = useState<{ id: number | null; draft: Draft } | null>(null);
    const [saving, setSaving] = useState(false);
    // A resource waiting for its deletion to be confirmed
    const [deleting, setDeleting] = useState<FacilityResource | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const isDark = useIsDark();
    const tint = sectionTint(isDark);
    const primary = useFacilityStyles().colors.primary;

    const load = () => listResources().then(setResources).catch((e: any) => toast.error(String(e?.message || e)));
    useEffect(() => {
        void load();
        listMicroscopes().then(setMicroscopes).catch(() => setMicroscopes([]));
    }, []);

    const set = (change: Partial<Draft>) => setEditing((current) => current && { ...current, draft: { ...current.draft, ...change } });
    const number = (value: string) => (value.trim() === "" ? null : Number(value));
    const draft = editing?.draft;
    const hoursWrong = !!draft && [draft.minHours, draft.maxHours].some((value) => value.trim() !== "" && !(Number(value) > 0));

    const save = async () => {
        if (!editing || !draft) return;
        const payload: ResourcePayload = { ...draft, name: draft.name.trim(), minHours: number(draft.minHours),
                                           maxHours: number(draft.maxHours) };
        setSaving(true);
        try {
            if (editing.id == null) await createResource(payload);
            else await updateResource(editing.id, payload);
            toast.success("Resource saved.");
            setEditing(null);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || e));
        } finally {
            setSaving(false);
        }
    };
    const remove = async (resource: FacilityResource) => {
        setDeleteBusy(true);
        try {
            await deleteResource(resource.id);
            toast.success(`${resource.name} deleted.`);
            setDeleting(null);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || e));
        } finally {
            setDeleteBusy(false);
        }
    };
    // One with bookings cannot go: out of use, it is kept with its history and nobody books it any more
    const retire = async (resource: FacilityResource) => {
        setDeleteBusy(true);
        try {
            await updateResource(resource.id, { ...resource, active: false } as ResourcePayload);
            toast.success(`${resource.name} is out of use: nobody can book it.`);
            setDeleting(null);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || e));
        } finally {
            setDeleteBusy(false);
        }
    };

    return (
        <SettingsDialog
            title="Resources"
            description="What the facility's users book: the microscopes (each has its own) and any other instrument or service, with how it is charged, how long a user may book it and when its day starts."
            icon={<Settings2 size={20} color="white" />}
            confirmLabel={editing ? "Save resource" : "Done"}
            busyLabel="Saving…"
            busy={saving}
            confirmDisabled={!!editing && (!draft?.name.trim() || hoursWrong)}
            maxWidth="md"
            closeButton
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => (editing ? void save() : onClose())}
            onClose={() => (editing ? setEditing(null) : onClose())}
        >
            {editing && draft ? (
                <Stack spacing={2}>
                    <Box>
                        <Button size="small" variant="text" startIcon={<ArrowLeft size={15} />}
                                sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note, fontWeight: 600 }}
                                onClick={() => setEditing(null)}>
                            All resources
                        </Button>
                    </Box>
                    <DialogPart icon={<Boxes size={18} />} title={editing.id == null ? "New resource" : draft.name || "Resource"}
                                subtitle="Its name, the microscope it is (if one) and its colour in the calendar." tint={tint} colors={colors}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            <TextField sx={fieldSx} size="small" fullWidth label="Name" value={draft.name} autoFocus
                                       placeholder="Vitrobot Mark IV" onChange={(e) => set({ name: e.target.value })} />
                            <FormControl size="small" fullWidth>
                                <InputLabel id="resource-microscope-label">Microscope</InputLabel>
                                <Select labelId="resource-microscope-label" label="Microscope" sx={selectSx}
                                        value={draft.microscopeId ?? ""} MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                        onChange={(e) => set({ microscopeId: String(e.target.value) === "" ? null : Number(e.target.value) })}>
                                    <MenuItem value="">None: another instrument or a service</MenuItem>
                                    {microscopes.map((microscope) => (
                                        <MenuItem key={microscope.id} value={microscope.id}>{microscope.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" aria-label="Colour">
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text, minWidth: 70 }}>
                                Colour
                            </Typography>
                            {PALETTE.map((color) => {
                                const chosen = (draft.color || resourceColor({ id: editing.id ?? 0, color: "" })).toLowerCase() === color;
                                return (
                                    <Box key={color} component="button" type="button" aria-label={`Colour ${color}`} aria-pressed={chosen}
                                         onClick={() => set({ color })}
                                         sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: color, cursor: "pointer", p: 0,
                                               border: "2px solid", borderColor: chosen ? colors.text : "transparent",
                                               boxShadow: chosen ? `0 0 0 2px ${colors.hover}` : "none" }} />
                                );
                            })}
                            <Tooltip arrow title="Another colour">
                                <Box component="label" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, cursor: "pointer",
                                                             color: colors.muted, fontSize: FACILITY_TEXT.note, ml: 0.5 }}>
                                    <Box component="input" type="color" aria-label="Another colour"
                                         value={draft.color || resourceColor({ id: editing.id ?? 0, color: "" })}
                                         onChange={(e: ChangeEvent<HTMLInputElement>) => set({ color: e.target.value })}
                                         sx={{ width: 30, height: 30, p: 0, border: `1px solid ${colors.border}`, borderRadius: 1,
                                               bgcolor: "transparent", cursor: "pointer" }} />
                                    Other
                                </Box>
                            </Tooltip>
                        </Stack>
                    </DialogPart>

                    <DialogPart icon={<Clock size={18} />} title="How it is booked"
                                subtitle="How it is charged, how long a booking may be and when its day starts." tint={tint} colors={colors}>
                        <ToggleButtonGroup exclusive size="small" value={draft.unit} aria-label="Charged"
                                           onChange={(_, value) => value && set({ unit: value as ResourceUnit })}
                                           sx={choiceButtonsSx({ ...colors, card: "", primary }, isDark)}>
                            {(Object.keys(UNIT_LABELS) as ResourceUnit[]).map((value) => (
                                <ToggleButton key={value} value={value}>{UNIT_LABELS[value]}</ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            <TextField sx={fieldSx} size="small" fullWidth label="Shortest booking (h)" value={draft.minHours}
                                       inputProps={{ inputMode: "decimal" }} placeholder="24" helperText="Empty: no limit"
                                       onChange={(e) => set({ minHours: e.target.value })} />
                            <TextField sx={fieldSx} size="small" fullWidth label="Longest booking (h)" value={draft.maxHours}
                                       inputProps={{ inputMode: "decimal" }} placeholder="72" helperText="Empty: no limit"
                                       onChange={(e) => set({ maxHours: e.target.value })} />
                            <TextField sx={fieldSx} size="small" fullWidth type="time" label="Its day starts" value={draft.dayStart}
                                       InputLabelProps={{ shrink: true }} helperText="Whole days are booked from it"
                                       onChange={(e) => set({ dayStart: e.target.value })} />
                        </Stack>
                        {hoursWrong && <Alert severity="warning">The hours are numbers above 0.</Alert>}
                    </DialogPart>

                    <DialogPart icon={<ShieldCheck size={18} />} title="Who may book it" tint={tint} colors={colors}
                                subtitle="Whether it is offered, and whether it needs training first.">
                        <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, px: 1.75 }}>
                            <OptionRow colors={colors} title="In use" checked={draft.active} onChange={(active) => set({ active })}
                                       description="Users can book it. Off: it stays with its bookings, but nobody can book it." />
                            <OptionRow colors={colors} title="Needs training to use it" checked={draft.requiresAuthorization}
                                       onChange={(requiresAuthorization) => set({ requiresAuthorization })}
                                       description="Only people trained on it should book it." />
                        </Box>
                        <TextField sx={fieldSx} size="small" multiline minRows={2} label="Notes" value={draft.notes}
                                   onChange={(e) => set({ notes: e.target.value })} />
                    </DialogPart>
                </Stack>
            ) : (
                <Stack spacing={1.5}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text }}>
                            {resources === null ? "" : resources.length === 1 ? "1 resource" : `${resources.length} resources`}
                        </Typography>
                        <Button size="small" variant="contained" sx={saveButtonSx ?? actionSx} startIcon={<Plus size={14} />}
                                onClick={() => setEditing({ id: null, draft: draftOf(EMPTY) })}>
                            Add resource
                        </Button>
                    </Stack>
                    {resources !== null && resources.length === 0 && (
                        <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 2.5, textAlign: "center" }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>No resources yet.</Typography>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.5 }}>
                                Add the microscopes and any instrument or service the users book.
                            </Typography>
                        </Box>
                    )}
                    {(resources ?? []).map((resource) => {
                        const facts = [
                            { icon: <Receipt size={15} />, text: UNIT_LABELS[resource.unit] },
                            { icon: <Timer size={15} />, text: resource.minHours || resource.maxHours
                                ? `${resource.minHours ?? "…"}–${resource.maxHours ?? "…"} h` : "" },
                            { icon: <Sunrise size={15} />, text: resource.unit === "session" ? `day from ${resource.dayStart}` : "" },
                            { icon: <MicroscopeIcon size={15} />, text: resource.microscopeName ?? "" },
                        ].filter((fact) => fact.text);
                        return (
                            <Stack key={resource.id} direction="row" spacing={1.5} alignItems="center"
                                   sx={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${resourceColor(resource)}`,
                                         borderRadius: 2.5, px: 2, py: 1.25, opacity: resource.active ? 1 : 0.65 }}>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
                                        <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                                            {resource.name}
                                        </Typography>
                                        {!resource.active && <Pill color="#64748b">Not in use</Pill>}
                                        {resource.microscopeName && resource.runsSessions && <Pill color="#2563eb">Makes sessions</Pill>}
                                        {resource.microscopeName && !resource.runsSessions && <Pill color="#64748b">Runs no sessions</Pill>}
                                        {resource.requiresAuthorization && <Pill color="#b45309">Needs training</Pill>}
                                    </Stack>
                                    <Stack direction="row" useFlexGap flexWrap="wrap" columnGap={2} rowGap={0.5}>
                                        {facts.map((fact) => (
                                            <Stack key={fact.text} direction="row" spacing={0.6} alignItems="center" sx={{ color: colors.muted }}>
                                                {fact.icon}
                                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text }}>{fact.text}</Typography>
                                            </Stack>
                                        ))}
                                    </Stack>
                                </Box>
                                <Button size="small" variant="outlined" sx={actionSx} startIcon={<Pencil size={14} />}
                                        aria-label={`Change ${resource.name}`}
                                        onClick={() => setEditing({ id: resource.id, draft: draftOf(resource) })}>
                                    Edit
                                </Button>
                                <Tooltip arrow title="Delete it (one with bookings stays: set it out of use)">
                                    <IconButton size="small" aria-label={`Delete ${resource.name}`} sx={{ color: "#dc2626" }}
                                                onClick={() => setDeleting(resource)}>
                                        <Trash2 size={17} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        );
                    })}
                </Stack>
            )}
            {deleting && (
                <SettingsDialog
                    title={`Delete ${deleting.name}?`}
                    description="It goes for good. A resource with bookings cannot be deleted: set it out of use instead, and its bookings stay."
                    icon={<Trash2 size={20} color="#fca5a5" />}
                    confirmLabel="Delete"
                    busyLabel="Deleting…"
                    busy={deleteBusy}
                    destructive
                    maxWidth="xs"
                    actionButtonSx={actionSx}
                    closeButton
                    footerNote={deleting.active ? (
                        <Button size="small" variant="text" disabled={deleteBusy} startIcon={<Ban size={14} />}
                                sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note }} onClick={() => void retire(deleting)}>
                            Set out of use instead
                        </Button>
                    ) : undefined}
                    onConfirm={() => void remove(deleting)}
                    onClose={() => setDeleting(null)}
                >
                    <Box sx={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${resourceColor(deleting)}`, borderRadius: 2,
                               px: 1.5, py: 1.25 }}>
                        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 800 }}>{deleting.name}</Typography>
                            {!deleting.active && <Pill color="#64748b">Not in use</Pill>}
                        </Stack>
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.25 }}>
                            {[UNIT_LABELS[deleting.unit], deleting.microscopeName && `the microscope ${deleting.microscopeName}`]
                                .filter(Boolean).join(" · ")}
                        </Typography>
                    </Box>
                </SettingsDialog>
            )}
        </SettingsDialog>
    );
}
