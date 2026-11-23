import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    FormControl,
    IconButton,
    InputAdornment,
    MenuItem,
    Select,
    Stack,
    Switch,
    Table as MuiTable,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { CircleCheck, CircleDashed, RefreshCw, Search, Trash2, UserCheck, UserCog, UserX, Users } from "lucide-react";
import toast from "react-hot-toast";

import {
    listAdminUsers,
    updateAdminUser,
    deleteAdminUser,
    previewUserDeletion,
    type UserDeletionPreview,
    type AdminUser,
    type AdminUserPatch,
} from "@/api/users";
import { listGroupNames, listRoles, type Role } from "@/api/access";
import SettingsDialog, { ROUNDED_BUTTON_SX } from "./SettingsDialog";
import { choiceButtonsSx, SETTINGS_TEXT, SettingsSection } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";

type UserManagementPanelProps = {
    currentUserId: number | null;
    // The page's own look; the panel takes the shared Settings one when they are not given
    fieldSx?: any;
    cardSx?: any;
    cardHeaderSx?: any;
    selectSx?: any;
    menuPaperSx?: any;
    actionButtonSx?: any;
    colors?: {
        border: string;
        text: string;
        muted: string;
        surface: string;
        hover: string;
    };
};

type Show = "all" | "active" | "inactive";

function fullName(user: AdminUser): string {
    return [user.firstName, user.lastName].filter(Boolean).join(" ");
}

function initials(user: AdminUser): string {
    const name = fullName(user) || user.email;
    const parts = name.split(/[\s@.]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function UserManagementPanel({ currentUserId }: UserManagementPanelProps) {
    const isDarkMode = useTheme().palette.mode === "dark";
    const { colors, fieldSx, selectSx, menuPaperSx, actionButtonSx } = useSettingsStyles(isDarkMode);
    const sectionColors = { ...colors, hover: colors.hover };

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [show, setShow] = useState<Show>("all");
    const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
    const [roles, setRoles] = useState<Role[]>([]);
    const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
    const [deleting, setDeleting] = useState<AdminUser | null>(null);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const [loadedUsers, loadedRoles, loadedGroups] = await Promise.all([
                listAdminUsers(), listRoles(), listGroupNames(),
            ]);
            setRoles(loadedRoles);
            setGroups(loadedGroups);
            setUsers(loadedUsers);
        } catch (e: any) {
            setError(String(e?.message || "Failed to load users"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadUsers();
    }, [loadUsers]);

    // New accounts wait, inactive, until an administrator activates them
    const inactiveCount = useMemo(() => users.filter((user) => !user.isActive).length, [users]);
    const activeCount = users.length - inactiveCount;

    const filteredUsers = useMemo(() => {
        const query = filter.trim().toLowerCase();
        return users.filter((user) => {
            if (show === "active" && !user.isActive) return false;
            if (show === "inactive" && user.isActive) return false;
            if (!query) return true;
            return (
                fullName(user).toLowerCase().includes(query) ||
                user.email.toLowerCase().includes(query) ||
                String(user.institution ?? "").toLowerCase().includes(query) ||
                roles.some((role) => user.roleIds?.includes(role.id) && role.name.toLowerCase().includes(query)) ||
                groups.some((group) => user.groupIds?.includes(group.id) && group.name.toLowerCase().includes(query))
            );
        });
    }, [users, filter, show, roles, groups]);

    const updateUser = useCallback(async (user: AdminUser, patch: AdminUserPatch) => {
        setUpdatingIds((prev) => new Set(prev).add(user.id));

        try {
            const updated = await updateAdminUser(user.id, patch);
            setUsers((prev) => prev.map((item) => item.id === updated.id ? updated : item));
            toast.success("User updated.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to update user"));
        } finally {
            setUpdatingIds((prev) => {
                const next = new Set(prev);
                next.delete(user.id);
                return next;
            });
        }
    }, []);

    if (loading && users.length === 0) {
        return (
            <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
                <CircularProgress size={30} />
            </Box>
        );
    }

    const text = { fontSize: SETTINGS_TEXT.text, color: colors.muted } as const;
    const headCellSx = {
        fontSize: SETTINGS_TEXT.text, fontWeight: 700, color: colors.muted, bgcolor: colors.card,
        borderColor: colors.border, whiteSpace: "nowrap",
    } as const;
    const cellSx = { fontSize: SETTINGS_TEXT.control, color: colors.text, borderColor: colors.border } as const;

    return (
        <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}

            <SettingsSection
                icon={<UserCog size={19} />}
                title="Accounts"
                subtitle="Activate new accounts and choose what each person can do (roles) and who they work with (groups)."
                actions={
                    <Button size="small" sx={actionButtonSx} startIcon={<RefreshCw size={15} />} disabled={loading}
                            onClick={() => void loadUsers()}>
                        Reload
                    </Button>
                }
                colors={sectionColors}
                isDarkMode={isDarkMode}
                plain
            >
                <Stack spacing={1.75}>
                    {inactiveCount > 0 && (
                        <Box sx={{
                            display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", px: 2, py: 1.25,
                            borderRadius: 2, border: "1px solid",
                            borderColor: isDarkMode ? "rgba(251,191,36,0.35)" : "rgba(217,119,6,0.35)",
                            bgcolor: isDarkMode ? "rgba(251,191,36,0.08)" : "rgba(254,243,199,0.6)",
                        }}>
                            <UserX size={18} color={isDarkMode ? "#fbbf24" : "#b45309"} />
                            <Typography sx={{ fontSize: SETTINGS_TEXT.control, color: colors.text, flex: 1, minWidth: 200 }}>
                                {inactiveCount === 1
                                    ? "1 account is not active. "
                                    : `${inactiveCount} accounts are not active. `}
                                New accounts cannot sign in until you turn on Active.
                            </Typography>
                            {show !== "inactive" && (
                                <Button size="small" sx={actionButtonSx} onClick={() => setShow("inactive")}>
                                    Show them
                                </Button>
                            )}
                        </Box>
                    )}

                    <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
                        <TextField
                            sx={{ ...fieldSx, flex: 1 }}
                            size="small"
                            label="Search users"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Name, email, institution, role or group"
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search size={16} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <ToggleButtonGroup exclusive size="small" value={show} aria-label="Which accounts"
                                           onChange={(_, next) => next && setShow(next)}
                                           sx={choiceButtonsSx(sectionColors, isDarkMode)}>
                            <ToggleButton value="all"><Users size={16} />All ({users.length})</ToggleButton>
                            <ToggleButton value="active"><UserCheck size={16} />Active ({activeCount})</ToggleButton>
                            <ToggleButton value="inactive"><UserX size={16} />Not active ({inactiveCount})</ToggleButton>
                        </ToggleButtonGroup>
                    </Stack>

                    {filteredUsers.length === 0 ? (
                        <Typography sx={{ ...text, py: 2 }}>
                            {filter.trim() ? "No account matches the search." : "No account here."}
                        </Typography>
                    ) : (
                        <TableContainer sx={{ border: "1px solid", borderColor: colors.border, borderRadius: 2,
                                              overflow: "auto" }}>
                            <MuiTable size="small" aria-label="Accounts">
                                <TableHead>
                                    <TableRow>
                                        {["Person", "Institution", "Roles", "Groups", "Active", "Email"].map((label) => (
                                            <TableCell key={label} sx={headCellSx}>{label}</TableCell>
                                        ))}
                                        <TableCell sx={headCellSx} />
                                    </TableRow>
                                </TableHead>

                                <TableBody>
                                    {filteredUsers.map((user) => {
                                        const isCurrentUser = currentUserId === user.id;
                                        const updating = updatingIds.has(user.id);

                                        return (
                                            <TableRow key={user.id} hover
                                                      sx={{ opacity: user.isActive ? 1 : 0.78,
                                                            "& td": { py: 1.1 } }}>
                                                <TableCell sx={{ ...cellSx, minWidth: 240 }}>
                                                    <Stack direction="row" spacing={1.25} alignItems="center">
                                                        <Box aria-hidden sx={{
                                                            width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                                                            display: "grid", placeItems: "center", fontSize: 13.5,
                                                            fontWeight: 800, color: colors.primary,
                                                            bgcolor: isDarkMode ? "rgba(96,165,250,0.14)" : "rgba(37,99,235,0.08)",
                                                        }}>
                                                            {initials(user)}
                                                        </Box>
                                                        <Box sx={{ minWidth: 0 }}>
                                                            <Stack direction="row" spacing={0.75} alignItems="center">
                                                                <Typography sx={{ fontSize: SETTINGS_TEXT.control, fontWeight: 700,
                                                                                  color: colors.text }}>
                                                                    {fullName(user) || "—"}
                                                                </Typography>
                                                                {isCurrentUser && (
                                                                    <Box component="span" sx={{
                                                                        px: 0.9, py: 0.1, borderRadius: 999, fontSize: 12.5,
                                                                        fontWeight: 700, color: colors.primary,
                                                                        border: "1px solid", borderColor: colors.primary,
                                                                    }}>
                                                                        You
                                                                    </Box>
                                                                )}
                                                            </Stack>
                                                            <Typography sx={{ ...text, wordBreak: "break-all" }}>
                                                                {user.email}
                                                            </Typography>
                                                        </Box>
                                                    </Stack>
                                                </TableCell>

                                                <TableCell sx={{ ...cellSx, color: user.institution ? colors.text : colors.muted }}>
                                                    {user.institution || "—"}
                                                </TableCell>

                                                <TableCell sx={{ ...cellSx, minWidth: 190 }}>
                                                    <IdsSelect
                                                        label={`Roles ${user.email}`}
                                                        options={roles}
                                                        value={user.roleIds ?? []}
                                                        disabled={updating}
                                                        selectSx={selectSx}
                                                        menuPaperSx={menuPaperSx}
                                                        onChange={(roleIds) => void updateUser(user, { roleIds })}
                                                    />
                                                </TableCell>

                                                <TableCell sx={{ ...cellSx, minWidth: 170 }}>
                                                    <IdsSelect
                                                        label={`Groups ${user.email}`}
                                                        options={groups}
                                                        value={user.groupIds ?? []}
                                                        disabled={updating}
                                                        selectSx={selectSx}
                                                        menuPaperSx={menuPaperSx}
                                                        onChange={(groupIds) => void updateUser(user, { groupIds })}
                                                    />
                                                </TableCell>

                                                <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                                                    <Tooltip arrow title={isCurrentUser ? "You cannot turn off your own account" : ""}>
                                                        <Stack direction="row" spacing={0.5} alignItems="center" component="span">
                                                            <Switch
                                                                size="small"
                                                                checked={user.isActive}
                                                                disabled={updating || isCurrentUser}
                                                                slotProps={{ input: { "aria-label": `Active ${user.email}` } }}
                                                                onChange={(e) => void updateUser(user, { isActive: e.target.checked })}
                                                            />
                                                            <Typography sx={{ fontSize: SETTINGS_TEXT.text, fontWeight: 600,
                                                                              color: user.isActive ? colors.text : colors.muted }}>
                                                                {user.isActive ? "Active" : "Not active"}
                                                            </Typography>
                                                        </Stack>
                                                    </Tooltip>
                                                </TableCell>

                                                <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                                                    <Tooltip arrow title={user.isVerified
                                                        ? "The person confirmed this address"
                                                        : "The person has not confirmed this address yet"}>
                                                        <Stack direction="row" spacing={0.6} alignItems="center" component="span">
                                                            {user.isVerified
                                                                ? <CircleCheck size={16} color="#16a34a" />
                                                                : <CircleDashed size={16} color={colors.muted} />}
                                                            <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: user.isVerified
                                                                ? colors.text : colors.muted }}>
                                                                {user.isVerified ? "Confirmed" : "Not confirmed"}
                                                            </Typography>
                                                        </Stack>
                                                    </Tooltip>
                                                </TableCell>

                                                <TableCell sx={{ ...cellSx, width: 48 }} align="right">
                                                    {!isCurrentUser && (
                                                        <Tooltip arrow title="Delete the account, with its projects">
                                                            <IconButton size="small" aria-label={`Delete ${user.email}`}
                                                                        disabled={updating} onClick={() => setDeleting(user)}>
                                                                <Trash2 size={16} color="#dc2626" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </MuiTable>
                        </TableContainer>
                    )}
                </Stack>
            </SettingsSection>

            {deleting && (
                <DeleteUserDialog user={deleting} fieldSx={fieldSx} actionButtonSx={actionButtonSx}
                                  colors={colors}
                                  onClose={() => setDeleting(null)}
                                  onDeleted={(userId) => {
                                      setUsers((prev) => prev.filter((item) => item.id !== userId));
                                      setDeleting(null);
                                  }} />
            )}
        </Stack>
    );
}

function formatBytes(bytes: number | null | undefined): string {
    if (!bytes) return "";
    if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/** Deleting an account: what goes with it is listed first, and its address is typed to confirm. */
function DeleteUserDialog({ user, fieldSx, actionButtonSx, colors, onClose, onDeleted }: {
    user: AdminUser;
    fieldSx: any;
    actionButtonSx?: any;
    colors: { border: string; text: string; muted: string };
    onClose: () => void;
    onDeleted: (userId: number) => void;
}) {
    const [preview, setPreview] = useState<UserDeletionPreview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        previewUserDeletion(user.id).then(setPreview)
            .catch((e: any) => setError(String(e?.message || "Failed to read what deleting the account takes")));
    }, [user.id]);

    const blocked = !preview || preview.blockers.length > 0;
    const confirmed = typed.trim().toLowerCase() === user.email.toLowerCase();
    const sharedCount = preview?.projects.filter((project) => project.shares > 0).length ?? 0;
    const facility = preview?.facility;
    const facilityParts = facility ? [
        facility.sessions ? `${facility.sessions} facility session${facility.sessions === 1 ? "" : "s"}` : "",
        facility.bookings ? `${facility.bookings} booking${facility.bookings === 1 ? "" : "s"}` : "",
        facility.samples ? `${facility.samples} sample${facility.samples === 1 ? "" : "s"}` : "",
    ].filter(Boolean) : [];

    const remove = async () => {
        setBusy(true);
        try {
            const result = await deleteAdminUser(user.id, typed.trim());
            if (result.failed.length) {
                toast.error(`The account is disabled, but ${result.failed.length} project${result.failed.length === 1 ? "" : "s"} could not be deleted: `
                    + result.failed.map((project) => `${project.name} (${project.detail})`).join("; ")
                    + ". Delete the account again to retry.", { duration: 10000 });
            } else {
                toast.success(`${user.email} is being deleted${result.deleted.length ? `, with ${result.deleted.length} project${result.deleted.length === 1 ? "" : "s"}` : ""}.`);
            }
            onDeleted(user.id);
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to delete the account"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsDialog
            title="Delete this account?"
            description="Its projects go with it, and it cannot be undone."
            icon={<Trash2 size={20} color="#fca5a5" />}
            confirmLabel="Delete the account"
            busyLabel="Deleting…"
            busy={busy}
            destructive
            confirmDisabled={blocked || !confirmed}
            maxWidth="sm"
            actionButtonSx={actionButtonSx ?? ROUNDED_BUTTON_SX}
            onConfirm={() => void remove()}
            onClose={onClose}
        >
            <Stack spacing={1.25}>
                <Typography sx={{ fontSize: 14 }}>
                    <strong>{`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email}</strong> · {user.email}
                </Typography>
                {error && <Alert severity="error">{error}</Alert>}
                {!preview && !error && <Typography sx={{ fontSize: 14, color: colors.muted }}>Looking at what it owns…</Typography>}
                {preview && preview.blockers.map((blocker) => <Alert key={blocker} severity="warning">{blocker}</Alert>)}
                {preview && (
                    <Box data-testid="deleted-projects">
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: colors.text }}>
                            {preview.projects.length
                                ? `${preview.projects.length} project${preview.projects.length === 1 ? "" : "s"} will be deleted:`
                                : "It owns no project."}
                        </Typography>
                        {preview.projects.map((project) => (
                            <Typography key={project.id} sx={{ fontSize: 13.5, fontFamily: "monospace", color: colors.text }}>
                                {project.name}
                                {[formatBytes(project.bytes), project.shares ? `shared with ${project.shares}` : "",
                                  project.running ? `${project.running} running` : ""].filter(Boolean).map((part) => ` · ${part}`).join("")}
                            </Typography>
                        ))}
                        {sharedCount > 0 && (
                            <Typography sx={{ fontSize: 13.5, color: "#b45309", mt: 0.5 }}>
                                {sharedCount === 1 ? "One of them is" : `${sharedCount} of them are`} shared: the others lose {sharedCount === 1 ? "it" : "them"} too.
                            </Typography>
                        )}
                        {facilityParts.length > 0 && (
                            <Typography sx={{ fontSize: 13.5, color: colors.muted, mt: 0.5 }}>
                                {facilityParts.join(", ")} stay in the facility, without their user.
                            </Typography>
                        )}
                    </Box>
                )}
                <TextField sx={fieldSx} size="small" fullWidth label="Type the account's address to confirm" value={typed}
                           disabled={blocked} placeholder={user.email} onChange={(e) => setTyped(e.target.value)} />
            </Stack>
        </SettingsDialog>
    );
}


// A multiple choice of roles or groups, shown as their names
function IdsSelect({ label, options, value, disabled, selectSx, menuPaperSx, onChange }: {
    label: string;
    options: { id: number; name: string }[];
    value: number[];
    disabled: boolean;
    selectSx: any;
    menuPaperSx: any;
    onChange: (ids: number[]) => void;
}) {
    const names = new Map(options.map((option) => [option.id, option.name]));
    return (
        <FormControl fullWidth size="small">
            <Select
                multiple
                sx={selectSx}
                MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                value={value}
                disabled={disabled}
                displayEmpty
                SelectDisplayProps={{ "aria-label": label }}
                renderValue={(selected) =>
                    (selected as number[]).length === 0
                        ? "None"
                        : (selected as number[]).map((id) => names.get(id) ?? `#${id}`).join(", ")
                }
                onChange={(e) => onChange((e.target.value as number[]).map(Number))}
            >
                {options.map((option) => (
                    <MenuItem key={option.id} value={option.id}>
                        {option.name}
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}
