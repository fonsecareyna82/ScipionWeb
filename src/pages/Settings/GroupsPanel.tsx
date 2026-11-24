import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    CircularProgress,
    IconButton,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Crown, Eye, KeyRound, Plus, RefreshCw, Trash2, UserPlus, Users, UsersRound, X } from "lucide-react";
import { DialogPart } from "@/pages/Facility/DialogParts";
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
import { SETTINGS_TEXT, SettingsSection, choiceButtonsSx, sectionTint } from "./SettingsSection";
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
                    closeButton
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
                    <Box sx={{ border: `1px solid ${colors.border}`, borderLeft: "4px solid #dc2626", borderRadius: 2, px: 1.5, py: 1.25 }}>
                        <Typography sx={{ fontSize: SETTINGS_TEXT.title, fontWeight: 800, color: colors.text }}>{deleting.name}</Typography>
                        {deleting.description && (
                            <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted }}>{deleting.description}</Typography>
                        )}
                        <Stack direction="row" spacing={2} sx={{ mt: 0.75, color: colors.muted }}>
                            <Stack direction="row" spacing={0.6} alignItems="center">
                                <Users size={15} />
                                <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.text }}>{plural(deleting.members.length, "member")}</Typography>
                            </Stack>
                            <Stack direction="row" spacing={0.6} alignItems="center">
                                <KeyRound size={15} />
                                <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.text }}>{plural(deleting.roleIds.length, "role")}</Typography>
                            </Stack>
                        </Stack>
                    </Box>
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
                    colors={colors}
                    isDarkMode={isDarkMode}
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

function GroupDialog({ group, roles, users, fieldSx, menuPaperSx, colors, isDarkMode, actionButtonSx, saveButtonSx,
                       onClose, onSaved }: {
    colors: { border: string; text: string; muted: string; hover: string; card: string; primary: string };
    isDarkMode: boolean;
    actionButtonSx: any;
    saveButtonSx: any;
    group: Group | null;
    roles: Role[];
    users: AdminUser[];
    fieldSx: any;
    selectSx?: any;
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
    // The Add member field is emptied after each one added
    const [adding, setAdding] = useState(0);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const tint = sectionTint(isDarkMode);
    const choiceSx = choiceButtonsSx({ ...colors }, isDarkMode);
    const others = users.filter((user) => !memberIds.includes(user.id));

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

    const removeMember = (userId: number) => {
        setMemberIds((current) => current.filter((id) => id !== userId));
        setPiIds((current) => current.filter((id) => id !== userId));
    };
    const togglePi = (userId: number, on: boolean) =>
        setPiIds((current) => (on ? [...current, userId] : current.filter((id) => id !== userId)));

    return (
        <SettingsDialog
            title={group ? `Edit ${group.name}` : "New group"}
            description="Its members hold the group's roles and see the projects shared with it."
            icon={<Users size={20} color="white" />}
            confirmLabel="Save"
            busyLabel="Saving…"
            busy={saving}
            confirmDisabled={!name.trim()}
            maxWidth="md"
            footerNote={`${plural(memberIds.length, "member")} · ${plural(piIds.length, "PI")}`}
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            closeButton
            onConfirm={() => void save()}
            onClose={onClose}
        >
            <Stack spacing={2}>
                <DialogPart icon={<UsersRound size={18} />} title="The group" tint={tint} colors={colors}
                            subtitle="A lab, a team or a project: whoever works together.">
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="Name" value={name} placeholder="Lab of Ana"
                                   onChange={(e) => setName(e.target.value)} />
                        <TextField sx={{ ...fieldSx, flex: 2 }} size="small" label="Description" value={description}
                                   onChange={(e) => setDescription(e.target.value)} />
                    </Stack>
                </DialogPart>

                <DialogPart icon={<Users size={18} />} title="Members" tint={tint} colors={colors}
                            subtitle="Add people by name or email. A PI leads the group: see below what a PI may see.">
                    <Autocomplete
                        key={adding}
                        size="small"
                        options={others}
                        value={null}
                        getOptionLabel={(user) => `${userName(user)} (${user.email})`}
                        onChange={(_, user) => {
                            if (!user) return;
                            setMemberIds((current) => [...current, user.id]);
                            setAdding((count) => count + 1);
                        }}
                        slotProps={{ paper: { sx: menuPaperSx } }}
                        filterOptions={(options, { inputValue }) => {
                            const words = inputValue.trim().toLowerCase();
                            return options.filter((user) => `${userName(user)} ${user.email}`.toLowerCase().includes(words));
                        }}
                        renderOption={(props, user) => (
                            <Box component="li" {...props} key={user.id}>
                                <Box>
                                    <Box sx={{ fontSize: SETTINGS_TEXT.control }}>{userName(user)}</Box>
                                    <Box sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted }}>{user.email}</Box>
                                </Box>
                            </Box>
                        )}
                        renderInput={(params) => (
                            <TextField {...params} sx={fieldSx} label="Add a member" placeholder="Search by name or email"
                                       InputProps={{ ...params.InputProps,
                                                     startAdornment: <UserPlus size={16} style={{ color: colors.muted, marginLeft: 4 }} /> }} />
                        )}
                    />
                    {memberIds.length === 0 ? (
                        <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 1.75, textAlign: "center" }}>
                            <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted }}>No members yet.</Typography>
                        </Box>
                    ) : (
                        <Box component="ul" aria-label="Members" sx={{ listStyle: "none", m: 0, p: 0, border: `1px solid ${colors.border}`,
                                                                    borderRadius: 2, overflow: "hidden" }}>
                            {memberIds.map((userId, index) => {
                                const user = usersById.get(userId) ?? { email: `#${userId}` };
                                const label = userName(user);
                                const isPi = piIds.includes(userId);
                                return (
                                    <Box component="li" key={userId}
                                         sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1.5, py: 0.75,
                                               borderTop: index ? `1px solid ${colors.border}` : "none" }}>
                                        <Box sx={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                                                   bgcolor: isPi ? "rgba(217,119,6,0.15)" : tint, color: isPi ? "#b45309" : colors.primary,
                                                   fontWeight: 800, fontSize: 13 }}>
                                            {isPi ? <Crown size={15} /> : label.charAt(0).toUpperCase()}
                                        </Box>
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography sx={{ fontSize: SETTINGS_TEXT.control, fontWeight: 600, color: colors.text }}>{label}</Typography>
                                            {"email" in user && user.email && label !== user.email && (
                                                <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted }}>{user.email}</Typography>
                                            )}
                                        </Box>
                                        <Stack direction="row" spacing={0.25} alignItems="center">
                                            <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: isPi ? "#b45309" : colors.muted, fontWeight: 600 }}>PI</Typography>
                                            <Switch size="small" checked={isPi} onChange={(e) => togglePi(userId, e.target.checked)}
                                                    slotProps={{ input: { "aria-label": `${label} is a PI` } }} />
                                        </Stack>
                                        <Tooltip arrow title="Take out of the group">
                                            <IconButton size="small" aria-label={`Remove ${label}`} onClick={() => removeMember(userId)}>
                                                <X size={16} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </DialogPart>

                <DialogPart icon={<KeyRound size={18} />} title="Roles of its members" tint={tint} colors={colors}
                            subtitle="Every member holds these, besides their own. You can only give roles whose permissions you hold.">
                    {roles.length === 0 ? (
                        <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted }}>There are no roles yet.</Typography>
                    ) : (
                        <ToggleButtonGroup size="small" value={roleIds} aria-label="Roles of its members"
                                           onChange={(_, value: number[]) => setRoleIds(value)} sx={choiceSx}>
                            {roles.map((role) => (
                                <Tooltip key={role.id} arrow title={role.description || ""}>
                                    <ToggleButton value={role.id} aria-label={role.name}>
                                        <KeyRound size={14} style={{ marginRight: 6 }} />{role.name}
                                    </ToggleButton>
                                </Tooltip>
                            ))}
                        </ToggleButtonGroup>
                    )}
                </DialogPart>

                <DialogPart icon={<Crown size={18} />} title="What its PIs see" tint={tint} colors={colors}
                            subtitle="The PIs' access to their members' projects.">
                    <ToggleButtonGroup exclusive size="small" value={piAccess} aria-label="PI access to the members' projects"
                                       onChange={(_, value) => value && setPiAccess(value as PiAccess)} sx={choiceSx}>
                        {PI_ACCESS_OPTIONS.map((option) => (
                            <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                    <Box sx={{ borderRadius: 2, bgcolor: tint, px: 1.5, py: 1 }}>
                        <Typography sx={{ fontSize: SETTINGS_TEXT.control, color: colors.text }}>
                            {PI_ACCESS_OPTIONS.find((option) => option.value === piAccess)?.meaning}
                        </Typography>
                        <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted, mt: 0.5 }}>
                            Raising it needs as much over every project yourself (view: projects.viewAll; work or manage:
                            projects.manageAll).
                        </Typography>
                    </Box>
                </DialogPart>
            </Stack>
        </SettingsDialog>
    );
}
