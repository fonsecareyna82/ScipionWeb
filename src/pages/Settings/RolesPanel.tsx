import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Checkbox,
    Chip,
    CircularProgress,
    FormControlLabel,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import SettingsDialog, { ROUNDED_BUTTON_SX } from "./SettingsDialog";
import toast from "react-hot-toast";

import {
    createRole,
    deleteRole,
    listPermissions,
    listRoles,
    updateRole,
    type Permission,
    type Role,
    type RolePayload,
} from "@/api/access";

type PanelStyles = {
    fieldSx: any;
    cardSx: any;
    cardHeaderSx: any;
    actionButtonSx?: any;
    saveButtonSx?: any;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};

// The permissions grouped as the catalogue names them (projects.create → Projects)
const AREAS: Record<string, string> = {
    plugins: "System", settings: "System", jobs: "System", users: "System", roles: "System", groups: "System",
    audit: "System", projects: "Projects", files: "Files", facility: "Facility",
};

function permissionAreas(permissions: Permission[]): [string, Permission[]][] {
    const areas = new Map<string, Permission[]>();
    for (const permission of permissions) {
        const area = AREAS[permission.name.split(".")[0]] ?? "Other";
        areas.set(area, [...(areas.get(area) ?? []), permission]);
    }
    return Array.from(areas.entries());
}

export default function RolesPanel({ fieldSx, cardSx, cardHeaderSx, colors, actionButtonSx, saveButtonSx }: PanelStyles) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = saveButtonSx ?? ROUNDED_BUTTON_SX;
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Role | "new" | null>(null);
    const [deleting, setDeleting] = useState<Role | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [loadedRoles, loadedPermissions] = await Promise.all([listRoles(), listPermissions()]);
            setRoles(loadedRoles);
            setPermissions(loadedPermissions);
        } catch (e: any) {
            setError(String(e?.message || "Failed to load roles"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const remove = useCallback(async (role: Role) => {
        setDeleteBusy(true);
        try {
            await deleteRole(role.id);
            toast.success("Role deleted.");
            setDeleting(null);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to delete the role"));
        } finally {
            setDeleteBusy(false);
        }
    }, [load]);

    if (loading && roles.length === 0) {
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
                    title="Roles"
                    subheader="A role is a set of permissions. Users hold the roles given to them and to their groups."
                    sx={cardHeaderSx}
                    action={
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                    disabled={loading} onClick={() => void load()}>
                                Reload
                            </Button>
                            <Button size="small" variant="contained" sx={saveSx} startIcon={<Plus size={15} />}
                                    onClick={() => setEditing("new")}>
                                New role
                            </Button>
                        </Stack>
                    }
                />
                <CardContent sx={{ pt: 2 }}>
                    <Stack spacing={1}>
                        {roles.map((role) => (
                            <Box key={role.id} sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.5 }}>
                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography sx={{ fontSize: 14, fontWeight: 800, color: colors.text }}>
                                                {role.name}
                                            </Typography>
                                            {role.isSystem && <Chip size="small" label="System" />}
                                            {role.isDefault && <Chip size="small" variant="outlined" label="New accounts" />}
                                        </Stack>
                                        <Typography sx={{ fontSize: 12.5, color: colors.muted }}>
                                            {role.description || "—"} · {role.usersCount} users · {role.groupsCount} groups
                                        </Typography>
                                        <Typography sx={{ fontSize: 12, color: colors.muted }}>
                                            {role.isSystem ? "Every permission" : role.permissions.join(", ") || "No permissions"}
                                        </Typography>
                                    </Stack>
                                    {!role.isSystem && (
                                        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                            <Button size="small" variant="outlined" sx={actionSx} onClick={() => setEditing(role)}>
                                                Edit
                                            </Button>
                                            <Button size="small" variant="outlined" sx={{ ...actionSx, color: "error.main" }} onClick={() => setDeleting(role)}>
                                                Delete
                                            </Button>
                                        </Stack>
                                    )}
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                </CardContent>
            </Card>

            {deleting !== null && (
                <SettingsDialog
                    title="Delete role?"
                    description="This action cannot be undone. Its users and groups lose its permissions."
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
                    <Typography sx={{ fontSize: 14 }}>
                        <strong>{deleting.name}</strong> · {deleting.usersCount} users · {deleting.groupsCount} groups
                    </Typography>
                </SettingsDialog>
            )}

            {editing !== null && (
                <RoleDialog
                    actionButtonSx={actionSx}
                    saveButtonSx={saveSx}
                    role={editing === "new" ? null : editing}
                    permissions={permissions}
                    fieldSx={fieldSx}
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

function RoleDialog({ role, permissions, fieldSx, actionButtonSx, saveButtonSx, onClose, onSaved }: {
    actionButtonSx: any;
    saveButtonSx: any;
    role: Role | null;
    permissions: Permission[];
    fieldSx: any;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState(role?.name ?? "");
    const [description, setDescription] = useState(role?.description ?? "");
    const [isDefault, setIsDefault] = useState(Boolean(role?.isDefault));
    const [chosen, setChosen] = useState<Set<string>>(new Set(role?.permissions ?? []));
    const [saving, setSaving] = useState(false);
    const areas = useMemo(() => permissionAreas(permissions), [permissions]);

    const toggle = (permission: string) =>
        setChosen((current) => {
            const next = new Set(current);
            if (next.has(permission)) next.delete(permission);
            else next.add(permission);
            return next;
        });

    const save = async () => {
        const payload: RolePayload = { name: name.trim(), description: description.trim(), isDefault,
                                       permissions: Array.from(chosen).sort() };
        setSaving(true);
        try {
            if (role) await updateRole(role.id, payload);
            else await createRole(payload);
            toast.success("Role saved.");
            onSaved();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the role"));
        } finally {
            setSaving(false);
        }
    };

    const setArea = (items: Permission[], on: boolean) =>
        setChosen((current) => {
            const next = new Set(current);
            for (const permission of items) {
                if (on) next.add(permission.name);
                else next.delete(permission.name);
            }
            return next;
        });

    return (
        <SettingsDialog
            title={role ? `Edit ${role.name}` : "New role"}
            description="A role is a set of permissions; users hold it directly or through their groups."
            icon={<KeyRound size={20} color="white" />}
            confirmLabel="Save"
            busyLabel="Saving…"
            busy={saving}
            confirmDisabled={!name.trim()}
            maxWidth="md"
            footerNote={`${chosen.size} of ${permissions.length} permissions · you can only give the ones you hold`}
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => void save()}
            onClose={onClose}
        >
            <Stack spacing={2}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="Name" value={name} autoFocus
                               onChange={(e) => setName(e.target.value)} />
                    <TextField sx={{ ...fieldSx, flex: 2 }} size="small" label="Description" value={description}
                               onChange={(e) => setDescription(e.target.value)} />
                </Stack>
                <FormControlLabel
                    sx={{ m: 0 }}
                    control={<Switch size="small" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />}
                    label={<Typography sx={{ fontSize: 13.5, ml: 1 }}>Give it to new accounts</Typography>}
                />
                {areas.map(([area, items]) => {
                    const chosenHere = items.filter((permission) => chosen.has(permission.name)).length;
                    return (
                        <Box key={area} sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between"
                                   sx={{ px: 1.5, py: 0.75, borderBottom: 1, borderColor: "divider" }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
                                    {area} <Box component="span" sx={{ fontWeight: 500, opacity: 0.65 }}>
                                        · {chosenHere}/{items.length}</Box>
                                </Typography>
                                <Button size="small" sx={{ ...ROUNDED_BUTTON_SX, minWidth: 0 }}
                                        onClick={() => setArea(items, chosenHere < items.length)}>
                                    {chosenHere < items.length ? "Select all" : "Clear"}
                                </Button>
                            </Stack>
                            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                                       columnGap: 1, px: 1, py: 0.5 }}>
                                {items.map((permission) => (
                                    <FormControlLabel
                                        key={permission.name}
                                        sx={{ m: 0, alignItems: "flex-start", py: 0.25 }}
                                        control={<Checkbox size="small" sx={{ pt: 0.5 }} checked={chosen.has(permission.name)}
                                                           onChange={() => toggle(permission.name)} />}
                                        label={
                                            <Box sx={{ pt: 0.6 }}>
                                                <Typography sx={{ fontSize: 13, lineHeight: 1.35 }}>
                                                    {permission.description}
                                                </Typography>
                                                <Typography sx={{ fontSize: 11.5, opacity: 0.6, fontFamily: "monospace" }}>
                                                    {permission.name}
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                ))}
                            </Box>
                        </Box>
                    );
                })}
            </Stack>
        </SettingsDialog>
    );
}
