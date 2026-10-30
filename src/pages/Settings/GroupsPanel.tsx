import { useCallback, useEffect, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { Plus, RefreshCw, Trash2, Users } from "lucide-react";
import SettingsDialog, { ROUNDED_BUTTON_SX } from "./SettingsDialog";
import toast from "react-hot-toast";

import {
    createGroup,
    deleteGroup,
    listGroups,
    listRoles,
    updateGroup,
    type Group,
    type GroupPayload,
    type Role,
} from "@/api/access";
import { listAdminUsers, type AdminUser } from "@/api/users";

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

function userName(user: { firstName?: string | null; lastName?: string | null; email?: string }) {
    return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "—";
}

export default function GroupsPanel({ fieldSx, cardSx, cardHeaderSx, selectSx, menuPaperSx, colors, actionButtonSx,
                                      saveButtonSx }: PanelStyles) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = saveButtonSx ?? ROUNDED_BUTTON_SX;
    const [groups, setGroups] = useState<Group[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Group | "new" | null>(null);
    const [deleting, setDeleting] = useState<Group | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [loadedGroups, loadedRoles, loadedUsers] = await Promise.all([
                listGroups(), listRoles(), listAdminUsers(),
            ]);
            setGroups(loadedGroups);
            setRoles(loadedRoles);
            setUsers(loadedUsers);
        } catch (e: any) {
            setError(String(e?.message || "Failed to load groups"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const remove = useCallback(async (group: Group) => {
        setDeleteBusy(true);
        try {
            await deleteGroup(group.id);
            toast.success("Group deleted.");
            setDeleting(null);
            await load();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to delete the group"));
        } finally {
            setDeleteBusy(false);
        }
    }, [load]);

    const roleNames = new Map(roles.map((role) => [role.id, role.name]));

    if (loading && groups.length === 0 && !error) {
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
                    title="Groups"
                    subheader="People who work together (a lab, the facility staff). Members hold the group's roles and see what is shared with it."
                    sx={cardHeaderSx}
                    action={
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                    disabled={loading} onClick={() => void load()}>
                                Reload
                            </Button>
                            <Button size="small" variant="contained" sx={saveSx} startIcon={<Plus size={15} />}
                                    onClick={() => setEditing("new")}>
                                New group
                            </Button>
                        </Stack>
                    }
                />
                <CardContent sx={{ pt: 2 }}>
                    <Stack spacing={1}>
                        {groups.length === 0 && <Alert severity="info">No groups yet.</Alert>}
                        {groups.map((group) => (
                            <Box key={group.id} sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.5 }}>
                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontSize: 14, fontWeight: 800, color: colors.text }}>
                                            {group.name}
                                        </Typography>
                                        <Typography sx={{ fontSize: 12.5, color: colors.muted }}>
                                            {group.description || "—"} · Roles:{" "}
                                            {group.roleIds.map((id) => roleNames.get(id) ?? `#${id}`).join(", ") || "none"}
                                        </Typography>
                                        <Typography sx={{ fontSize: 12, color: colors.muted }}>
                                            {group.members.length
                                                ? group.members.map((member) =>
                                                    userName(member) + (member.groupRole === "pi" ? " (PI)" : "")).join(", ")
                                                : "No members"}
                                        </Typography>
                                    </Stack>
                                    <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                        <Button size="small" variant="outlined" sx={actionSx} onClick={() => setEditing(group)}>
                                            Edit
                                        </Button>
                                        <Button size="small" variant="outlined" sx={{ ...actionSx, color: "error.main" }} onClick={() => setDeleting(group)}>
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
                    title="Delete group?"
                    description="This action cannot be undone. Its members lose its roles and the projects shared with it."
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
                        <strong>{deleting.name}</strong> · {deleting.members.length} members
                    </Typography>
                </SettingsDialog>
            )}

            {editing !== null && (
                <GroupDialog
                    actionButtonSx={actionSx}
                    saveButtonSx={saveSx}
                    group={editing === "new" ? null : editing}
                    roles={roles}
                    users={users}
                    fieldSx={fieldSx}
                    selectSx={selectSx}
                    menuPaperSx={menuPaperSx}
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

function GroupDialog({ group, roles, users, fieldSx, selectSx, menuPaperSx, actionButtonSx, saveButtonSx, onClose,
                       onSaved }: {
    actionButtonSx: any;
    saveButtonSx: any;
    group: Group | null;
    roles: Role[];
    users: AdminUser[];
    fieldSx: any;
    selectSx: any;
    menuPaperSx: any;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState(group?.name ?? "");
    const [description, setDescription] = useState(group?.description ?? "");
    const [roleIds, setRoleIds] = useState<number[]>(group?.roleIds ?? []);
    const [memberIds, setMemberIds] = useState<number[]>((group?.members ?? []).map((member) => member.userId));
    const [piIds, setPiIds] = useState<number[]>(
        (group?.members ?? []).filter((member) => member.groupRole === "pi").map((member) => member.userId));
    const [saving, setSaving] = useState(false);
    const usersById = new Map(users.map((user) => [user.id, user]));

    const save = async () => {
        const payload: GroupPayload = {
            name: name.trim(),
            description: description.trim(),
            roleIds,
            members: memberIds.map((userId) => ({ userId, groupRole: piIds.includes(userId) ? "pi" : "member" })),
        };
        setSaving(true);
        try {
            if (group) await updateGroup(group.id, payload);
            else await createGroup(payload);
            toast.success("Group saved.");
            onSaved();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the group"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsDialog
            title={group ? `Edit ${group.name}` : "New group"}
            description="Its members hold the group's roles and see the projects shared with it."
            icon={<Users size={20} color="white" />}
            confirmLabel="Save"
            busyLabel="Saving…"
            busy={saving}
            confirmDisabled={!name.trim()}
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => void save()}
            onClose={onClose}
        >
                <Stack spacing={1.5} sx={{ pt: 0.5 }}>
                    <TextField sx={fieldSx} size="small" label="Name" value={name}
                               onChange={(e) => setName(e.target.value)} />
                    <TextField sx={fieldSx} size="small" label="Description" value={description}
                               onChange={(e) => setDescription(e.target.value)} />
                    <FormControl size="small" fullWidth>
                        <InputLabel id="group-roles-label">Roles of its members</InputLabel>
                        <Select labelId="group-roles-label" label="Roles of its members" multiple sx={selectSx}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }} value={roleIds}
                                renderValue={(selected) => (selected as number[])
                                    .map((id) => roles.find((role) => role.id === id)?.name ?? `#${id}`).join(", ")}
                                onChange={(e) => setRoleIds((e.target.value as number[]).map(Number))}>
                            {roles.map((role) => <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                        <InputLabel id="group-members-label">Members</InputLabel>
                        <Select labelId="group-members-label" label="Members" multiple sx={selectSx}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }} value={memberIds}
                                renderValue={(selected) => (selected as number[])
                                    .map((id) => userName(usersById.get(id) ?? { email: `#${id}` })).join(", ")}
                                onChange={(e) => {
                                    const next = (e.target.value as number[]).map(Number);
                                    setMemberIds(next);
                                    setPiIds((current) => current.filter((id) => next.includes(id)));
                                }}>
                            {users.map((user) => (
                                <MenuItem key={user.id} value={user.id}>{userName(user)} ({user.email})</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth disabled={memberIds.length === 0}>
                        <InputLabel id="group-pis-label">PI</InputLabel>
                        <Select labelId="group-pis-label" label="PI" multiple sx={selectSx}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }} value={piIds}
                                renderValue={(selected) => (selected as number[])
                                    .map((id) => userName(usersById.get(id) ?? { email: `#${id}` })).join(", ")}
                                onChange={(e) => setPiIds((e.target.value as number[]).map(Number))}>
                            {memberIds.map((id) => (
                                <MenuItem key={id} value={id}>{userName(usersById.get(id) ?? { email: `#${id}` })}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Typography sx={{ fontSize: 12, opacity: 0.7 }}>
                        You can only give roles whose permissions you hold yourself.
                    </Typography>
                </Stack>
        </SettingsDialog>
    );
}
