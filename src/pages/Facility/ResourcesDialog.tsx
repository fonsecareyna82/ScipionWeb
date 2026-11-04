import { useEffect, useState } from "react";
import {
    Alert, Box, Button, Checkbox, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Select, Stack,
    TextField, Tooltip, Typography,
} from "@mui/material";
import { Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import SettingsDialog, { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import {
    createResource, deleteResource, listMicroscopes, listResources, updateResource,
    type FacilityResource, type Microscope, type ResourcePayload, type ResourceUnit,
} from "@/api/facility";
import { FACILITY_TEXT } from "./facilityStyles";

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
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;

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
        try {
            await deleteResource(resource.id);
            toast.success(`${resource.name} deleted.`);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || e));
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
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => (editing ? void save() : onClose())}
            onClose={() => (editing ? setEditing(null) : onClose())}
        >
            {editing && draft ? (
                <Stack spacing={2.5} sx={{ pt: 1 }}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
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
                        <TextField sx={{ ...fieldSx, width: 110, flexShrink: 0 }} size="small" type="color" label="Colour"
                                   value={draft.color || resourceColor({ id: editing.id ?? 0, color: "" })}
                                   InputLabelProps={{ shrink: true }} onChange={(e) => set({ color: e.target.value })} />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <FormControl size="small" fullWidth>
                            <InputLabel id="resource-unit-label">Charged</InputLabel>
                            <Select labelId="resource-unit-label" label="Charged" sx={selectSx} value={draft.unit}
                                    MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                    onChange={(e) => set({ unit: e.target.value as ResourceUnit })}>
                                {(Object.keys(UNIT_LABELS) as ResourceUnit[]).map((value) => (
                                    <MenuItem key={value} value={value}>{UNIT_LABELS[value]}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField sx={fieldSx} size="small" fullWidth label="Shortest booking (h)" value={draft.minHours}
                                   inputProps={{ inputMode: "decimal" }} placeholder="24"
                                   onChange={(e) => set({ minHours: e.target.value })} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Longest booking (h)" value={draft.maxHours}
                                   inputProps={{ inputMode: "decimal" }} placeholder="72"
                                   onChange={(e) => set({ maxHours: e.target.value })} />
                        <TextField sx={fieldSx} size="small" fullWidth type="time" label="Its day starts" value={draft.dayStart}
                                   InputLabelProps={{ shrink: true }} onChange={(e) => set({ dayStart: e.target.value })} />
                    </Stack>
                    {hoursWrong && <Alert severity="warning">The hours are numbers above 0.</Alert>}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
                        <FormControlLabel control={<Checkbox checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />}
                                          label="In use (users can book it)" />
                        <FormControlLabel control={<Checkbox checked={draft.requiresAuthorization}
                                                             onChange={(e) => set({ requiresAuthorization: e.target.checked })} />}
                                          label="Needs training to use it" />
                    </Stack>
                    <TextField sx={fieldSx} size="small" multiline minRows={2} label="Notes" value={draft.notes}
                               onChange={(e) => set({ notes: e.target.value })} />
                </Stack>
            ) : (
                <Stack spacing={1.25} sx={{ pt: 1 }}>
                    <Stack direction="row" justifyContent="flex-end">
                        <Button size="small" variant="outlined" sx={actionSx} startIcon={<Plus size={14} />}
                                onClick={() => setEditing({ id: null, draft: draftOf(EMPTY) })}>
                            Add resource
                        </Button>
                    </Stack>
                    {resources === null ? null : resources.length === 0 ? (
                        <Alert severity="info">No resources yet.</Alert>
                    ) : resources.map((resource) => (
                        <Stack key={resource.id} direction="row" spacing={1.5} alignItems="center"
                               sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, px: 1.75, py: 1.25,
                                     opacity: resource.active ? 1 : 0.6 }}>
                            <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: resourceColor(resource), flexShrink: 0 }} />
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                                    {resource.name}{resource.active ? "" : " (not in use)"}
                                </Typography>
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                                    {[UNIT_LABELS[resource.unit],
                                      (resource.minHours || resource.maxHours) && `${resource.minHours ?? "…"}–${resource.maxHours ?? "…"} h`,
                                      resource.unit === "session" && `day from ${resource.dayStart}`,
                                      resource.microscopeName && (resource.runsSessions ? `${resource.microscopeName}: its bookings make sessions`
                                          : `${resource.microscopeName} (runs no sessions)`)].filter(Boolean).join(" · ")}
                                </Typography>
                            </Box>
                            <Tooltip arrow title="Change it">
                                <IconButton size="small" aria-label={`Change ${resource.name}`}
                                            onClick={() => setEditing({ id: resource.id, draft: draftOf(resource) })}>
                                    <Pencil size={16} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip arrow title="Delete it (one with bookings stays: set it out of use)">
                                <IconButton size="small" aria-label={`Delete ${resource.name}`} onClick={() => void remove(resource)}>
                                    <Trash2 size={16} />
                                </IconButton>
                            </Tooltip>
                        </Stack>
                    ))}
                </Stack>
            )}
        </SettingsDialog>
    );
}
