import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Crown, Eye, Plus, RefreshCw, Trash2, Users, UsersRound } from "lucide-react";
import SettingsDialog from "./SettingsDialog";
import toast from "react-hot-toast";

import {
    createGroup,
    deleteGroup,
    listGroups,
    listRoles,
    updateGroup,
    type Group,
    type GroupPayload,
    type PiAccess,
    type Role,
} from "@/api/access";
import { listAdminUsers, type AdminUser } from "@/api/users";
import { SETTINGS_TEXT, SettingsSection, sectionTint } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";

// The page may still pass its own look; the panel uses the shared Settings one
type PanelStyles = {
    fieldSx?: any;
    cardSx?: any;
    cardHeaderSx?: any;
    selectSx?: any;
    menuPaperSx?: any;
    actionButtonSx?: any;
    saveButtonSx?: any;
    colors?: { border: string; text: string; muted: string; surface: string; hover: string };
};

const PI_ACCESS_OPTIONS: { value: PiAccess; label: string; meaning: string }[] = [
    { value: "none", label: "None", meaning: "The PIs do not see their members' projects." },
    { value: "view", label: "View", meaning: "The PIs see their members' projects, without changing them." },
    { value: "work", label: "Work", meaning: "The PIs can also run protocols in their members' projects." },
    { value: "manage", label: "Manage", meaning: "The PIs can do anything in their members' projects, also share or delete them." },
];

const MEMBERS_SHOWN = 8;

function userName(user: { firstName?: string | null; lastName?: string | null; email?: string }) {
    return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "—";
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the old look props are still accepted
export default function GroupsPanel(_styles: PanelStyles = {}) {
    const isDarkMode = useTheme().palette.mode === "dark";
    const { colors, fieldSx, selectSx, menuPaperSx, actionButtonSx: actionSx, saveButtonSx: saveSx } =
        useSettingsStyles(isDarkMode);
    const sectionColors = { ...colors, hover: colors.hover };
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

    const tint = sectionTint(isDarkMode);
    const pill = (label: ReactNode, strong: boolean, key?: string | number, title?: string) => (
        <Box key={key} component="span" title={title} sx={{
            display: "inline-flex", alignItems: "center", gap: 0.5, px: 1, py: 0.3, borderRadius: 999,
            fontSize: SETTINGS_TEXT.text, fontWeight: 600, border: "1px solid",
            borderColor: strong ? "transparent" : colors.border, bgcolor: strong ? tint : "transparent",
            color: strong ? colors.text : colors.muted,
        }}>
            {label}
        </Box>
    );
    const label = { fontSize: SETTINGS_TEXT.text, color: colors.muted, minWidth: 74 } as const;

    return (
        <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <SettingsSection
                icon={<UsersRound size={19} />}
                title="Groups"
                subtitle="People who work together (a lab, the facility staff). Members hold the group's roles and see what is shared with it."
                actions={
                    <Stack direction="row" spacing={1}>
                        <Button size="small" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                disabled={loading} onClick={() => void load()}>
                            Reload
                        </Button>
                        <Button size="small" variant="contained" sx={saveSx} startIcon={<Plus size={15} />}
                                onClick={() => setEditing("new")}>
                            New group
                        </Button>
                    </Stack>
                }
                colors={sectionColors}
                isDarkMode={isDarkMode}
            >
                {groups.length === 0 && (
                    <Typography sx={{ fontSize: SETTINGS_TEXT.control, color: colors.muted, py: 2.5 }}>
                        No groups yet.
                    </Typography>
                )}
                {groups.map((group) => {
                    const access = PI_ACCESS_OPTIONS.find((option) => option.value === (group.piAccess ?? "view"));
                    const pis = group.members.filter((member) => member.groupRole === "pi");
                    const members = [...pis, ...group.members.filter((member) => member.groupRole !== "pi")];
                    return (
                        <Box key={group.id} data-testid={`group-${group.id}`} sx={{
                            display: "flex", gap: { xs: 1.25, md: 3 }, py: 2,
                            flexDirection: { xs: "column", md: "row" }, alignItems: { md: "flex-start" },
                        }}>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography sx={{ fontSize: SETTINGS_TEXT.title, fontWeight: 700, color: colors.text }}>
                                    {group.name}
                                </Typography>
                                {group.description && (
                                    <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted, mt: 0.25 }}>
                                        {group.description}
                                    </Typography>
                                )}
                                <Stack spacing={0.9} sx={{ mt: 1.25 }}>
                                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
                                        <Typography sx={label}>Roles</Typography>
                                        {group.roleIds.length
                                            ? group.roleIds.map((id) => pill(roleNames.get(id) ?? `#${id}`, true, id))
                                            : pill("None", false)}
                                    </Stack>
                                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
                                        <Typography sx={label}>Members</Typography>
                                        {members.length === 0 && pill("Nobody yet", false)}
                                        {members.slice(0, MEMBERS_SHOWN).map((member) => member.groupRole === "pi"
                                            ? pill(<><Crown size={13} />{userName(member)} · PI</>, true, member.userId)
                                            : pill(userName(member), false, member.userId))}
                                        {members.length > MEMBERS_SHOWN && pill(`+${members.length - MEMBERS_SHOWN} more`, false)}
                                    </Stack>
                                    {pis.length > 0 && access && (
                                        <Stack direction="row" spacing={0.75} alignItems="center">
                                            <Typography sx={label}>PI access</Typography>
                                            {pill(<><Eye size={13} />{access.label}</>, false, undefined, access.meaning)}
                                            <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted }}>
                                                {access.meaning}
                                            </Typography>
                                        </Stack>
                                    )}
                                </Stack>
                            </Box>
                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
                                <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted, whiteSpace: "nowrap" }}>
                                    {plural(group.members.length, "member")}
                                </Typography>
                                <Button size="small" sx={actionSx} onClick={() => setEditing(group)}>
                                    Edit
                                </Button>
                                <Button size="small" sx={{ ...actionSx, color: "#dc2626" }}
                                        startIcon={<Trash2 size={15} />} onClick={() => setDeleting(group)}>
                                    Delete
                                </Button>
                            </Stack>
                        </Box>
                    );
                })}
            </SettingsSection>

            {deleting !== null && (
                <SettingsDialog
                    title="Delete group?"
                    description="This cannot be undone. Its members lose its roles and the projects shared with it."
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
                    <Typography sx={{ fontSize: SETTINGS_TEXT.control }}>
                        <strong>{deleting.name}</strong> · {plural(deleting.members.length, "member")}
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
                    muted={colors.muted}
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

function GroupDialog({ group, roles, users, fieldSx, selectSx, menuPaperSx, muted, actionButtonSx, saveButtonSx,
                       onClose, onSaved }: {
    muted: string;
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
    const [piAccess, setPiAccess] = useState<PiAccess>(group?.piAccess ?? "view");
    const [saving, setSaving] = useState(false);
    const usersById = new Map(users.map((user) => [user.id, user]));

    const save = async () => {
        const payload: GroupPayload = {
            name: name.trim(),
            description: description.trim(),
            roleIds,
            members: memberIds.map((userId) => ({ userId, groupRole: piIds.includes(userId) ? "pi" : "member" })),
            piAccess,
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
                    <FormControl size="small" fullWidth>
                        <InputLabel id="group-pi-access-label">PI access to the members' projects</InputLabel>
                        <Select labelId="group-pi-access-label" label="PI access to the members' projects"
                                sx={selectSx} MenuProps={{ PaperProps: { sx: menuPaperSx } }} value={piAccess}
                                onChange={(e) => setPiAccess(e.target.value as PiAccess)}>
                            {PI_ACCESS_OPTIONS.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </Select>
                        <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: muted, mt: 0.75, ml: 0.25 }}>
                            {PI_ACCESS_OPTIONS.find((option) => option.value === piAccess)?.meaning}
                        </Typography>
                    </FormControl>
                    <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: muted }}>
                        You can only give roles whose permissions you hold yourself. Raising the PI access
                        needs as much over every project (view: projects.viewAll; work or manage:
                        projects.manageAll).
                    </Typography>
                </Stack>
        </SettingsDialog>
    );
}
