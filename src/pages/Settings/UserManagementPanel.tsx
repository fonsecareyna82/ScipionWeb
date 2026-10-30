import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Chip,
    CircularProgress,
    FormControl,
    InputAdornment,
    MenuItem,
    Paper,
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
    Typography,
} from "@mui/material";
import { RefreshCw, Search } from "lucide-react";
import toast from "react-hot-toast";

import {
    listAdminUsers,
    updateAdminUser,
    type AdminUser,
    type AdminUserPatch,
} from "@/api/users";
import { listGroupNames, listRoles, type Role } from "@/api/access";

type UserManagementPanelProps = {
    currentUserId: number | null;
    fieldSx: any;
    cardSx: any;
    cardHeaderSx: any;
    selectSx: any;
    menuPaperSx: any;
    colors: {
        border: string;
        text: string;
        muted: string;
        surface: string;
        hover: string;
    };
};

export default function UserManagementPanel({
    currentUserId,
    fieldSx,
    cardSx,
    cardHeaderSx,
    selectSx,
    menuPaperSx,
    colors,
}: UserManagementPanelProps) {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
    const [roles, setRoles] = useState<Role[]>([]);
    const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);

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

    const filteredUsers = useMemo(() => {
        const query = filter.trim().toLowerCase();
        if (!query) return users;

        return users.filter((user) => {
            const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.toLowerCase();

            return (
                fullName.includes(query) ||
                user.email.toLowerCase().includes(query) ||
                String(user.institution ?? "").toLowerCase().includes(query) ||
                roles.some((role) => user.roleIds?.includes(role.id) && role.name.toLowerCase().includes(query)) ||
                groups.some((group) => user.groupIds?.includes(group.id) && group.name.toLowerCase().includes(query))
            );
        });
    }, [users, filter, roles, groups]);

    // New accounts wait, inactive, until an administrator activates them
    const inactiveCount = useMemo(() => users.filter((user) => !user.isActive).length, [users]);

    const updateUser = useCallback(async (user: AdminUser, patch: AdminUserPatch) => {
        setUpdatingIds((prev) => new Set(prev).add(user.id));

        try {
            const updated = await updateAdminUser(user.id, patch);

            setUsers((prev) =>
                prev.map((item) =>
                    item.id === updated.id ? updated : item
                )
            );

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

    return (
        <Stack spacing={1.75}>
            {error && <Alert severity="error">{error}</Alert>}

            <Card variant="outlined" sx={cardSx}>
                <CardHeader
                    title="Users"
                    subheader="Activate accounts and choose their roles and groups."
                    sx={cardHeaderSx}
                    action={
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<RefreshCw size={15} />}
                            disabled={loading}
                            onClick={() => void loadUsers()}
                        >
                            Reload
                        </Button>
                    }
                />

                <CardContent sx={{ pt: 2 }}>
                    <Stack spacing={1.5}>
                        {inactiveCount > 0 && (
                            <Alert severity="info">
                                {inactiveCount === 1
                                    ? "1 account is not active. "
                                    : `${inactiveCount} accounts are not active. `}
                                New accounts cannot sign in until you turn on Active.
                            </Alert>
                        )}

                        <TextField
                            sx={fieldSx}
                            fullWidth
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

                        <TableContainer
                            component={Paper}
                            variant="outlined"
                            sx={{
                                bgcolor: "transparent",
                                borderColor: colors.border,
                                borderRadius: 2,
                                overflow: "auto",
                            }}
                        >
                            <MuiTable size="small">
                                <TableHead>
                                    <TableRow>
                                        {["User", "Email", "Institution", "Roles", "Groups", "Active", "Verified"].map((label) => (
                                            <TableCell
                                                key={label}
                                                sx={{
                                                    bgcolor: colors.surface,
                                                    color: colors.text,
                                                    borderColor: colors.border,
                                                    fontSize: 12,
                                                    fontWeight: 900,
                                                }}
                                            >
                                                {label}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>

                                <TableBody>
                                    {filteredUsers.map((user) => {
                                        const isCurrentUser = currentUserId === user.id;
                                        const updating = updatingIds.has(user.id);

                                        return (
                                            <TableRow key={user.id} hover>
                                                <TableCell sx={{ borderColor: colors.border }}>
                                                    <Stack direction="row" spacing={1} alignItems="center">
                                                        <Typography sx={{ fontSize: 13, fontWeight: 800, color: colors.text }}>
                                                            {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
                                                        </Typography>

                                                        {isCurrentUser && (
                                                            <Chip size="small" label="You" />
                                                        )}
                                                    </Stack>
                                                </TableCell>

                                                <TableCell sx={{ borderColor: colors.border, color: colors.text, fontSize: 12.5 }}>
                                                    {user.email}
                                                </TableCell>

                                                <TableCell sx={{ borderColor: colors.border, color: colors.text, fontSize: 12.5 }}>
                                                    {user.institution || "—"}
                                                </TableCell>

                                                <TableCell sx={{ borderColor: colors.border, minWidth: 190 }}>
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

                                                <TableCell sx={{ borderColor: colors.border, minWidth: 170 }}>
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

                                                <TableCell sx={{ borderColor: colors.border, minWidth: 135 }}>
                                                    <Stack direction="row" spacing={0.75} alignItems="center">
                                                        <Switch
                                                            size="small"
                                                            checked={user.isActive}
                                                            disabled={updating || isCurrentUser}
                                                            slotProps={{
                                                                input: {
                                                                    "aria-label": `Active ${user.email}`,
                                                                },
                                                            }}
                                                            onChange={(e) =>
                                                                void updateUser(user, {
                                                                    isActive: e.target.checked,
                                                                })
                                                            }
                                                        />

                                                        <Typography sx={{ fontSize: 12.5, color: colors.muted }}>
                                                            {user.isActive ? "Active" : "Disabled"}
                                                        </Typography>
                                                    </Stack>
                                                </TableCell>

                                                <TableCell sx={{ borderColor: colors.border }}>
                                                    <Chip
                                                        size="small"
                                                        variant="outlined"
                                                        label={user.isVerified ? "Verified" : "Pending"}
                                                        color={user.isVerified ? "success" : "default"}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </MuiTable>
                        </TableContainer>

                        {!loading && filteredUsers.length === 0 && (
                            <Alert severity="info">No users match the current filter.</Alert>
                        )}
                    </Stack>
                </CardContent>
            </Card>
        </Stack>
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
