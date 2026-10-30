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
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { Plus, RefreshCw } from "lucide-react";
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

export default function RolesPanel({ fieldSx, cardSx, cardHeaderSx, colors }: PanelStyles) {
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Role | "new" | null>(null);

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
        if (!window.confirm(`Delete the role ${role.name}? Its users and groups lose its permissions.`)) return;
        try {
            await deleteRole(role.id);
            toast.success("Role deleted.");
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to delete the role"));
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
                            <Button size="small" variant="outlined" startIcon={<RefreshCw size={15} />}
                                    disabled={loading} onClick={() => void load()}>
                                Reload
                            </Button>
                            <Button size="small" variant="contained" startIcon={<Plus size={15} />}
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
                                            <Button size="small" variant="outlined" onClick={() => setEditing(role)}>
                                                Edit
                                            </Button>
                                            <Button size="small" color="error" onClick={() => void remove(role)}>
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

            {editing !== null && (
                <RoleDialog
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

function RoleDialog({ role, permissions, fieldSx, onClose, onSaved }: {
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

    return (
        <Dialog open onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
            <DialogContent>
                <Stack spacing={1.5} sx={{ pt: 1 }}>
                    <TextField sx={fieldSx} size="small" label="Name" value={name}
                               onChange={(e) => setName(e.target.value)} />
                    <TextField sx={fieldSx} size="small" label="Description" value={description}
                               onChange={(e) => setDescription(e.target.value)} />
                    <FormControlLabel
                        control={<Switch checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />}
                        label="Give it to new accounts"
                    />
                    {areas.map(([area, items]) => (
                        <Box key={area}>
                            <Typography sx={{ fontSize: 13, fontWeight: 800, mb: 0.5 }}>{area}</Typography>
                            <Stack>
                                {items.map((permission) => (
                                    <FormControlLabel
                                        key={permission.name}
                                        control={<Checkbox size="small" checked={chosen.has(permission.name)}
                                                           onChange={() => toggle(permission.name)} />}
                                        label={
                                            <Typography sx={{ fontSize: 13 }}>
                                                {permission.description} <Box component="span" sx={{ opacity: 0.6 }}>
                                                    ({permission.name})</Box>
                                            </Typography>
                                        }
                                    />
                                ))}
                            </Stack>
                        </Box>
                    ))}
                    <Typography sx={{ fontSize: 12, opacity: 0.7 }}>
                        You can only give permissions you hold yourself.
                    </Typography>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={saving || !name.trim()} onClick={() => void save()}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
