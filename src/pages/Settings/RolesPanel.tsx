import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    FormControlLabel,
    InputAdornment,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { KeyRound, ListChecks, Lock, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { useIsDark } from "@/context/ThemeContext";
import { DialogPart, OptionRow } from "@/pages/Facility/DialogParts";
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
import { SETTINGS_TEXT, SettingsSection, sectionTint } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";

// The page may still pass its own look; the panel uses the shared Settings one
type PanelStyles = {
    fieldSx?: any;
    cardSx?: any;
    cardHeaderSx?: any;
    actionButtonSx?: any;
    saveButtonSx?: any;
    colors?: { border: string; text: string; muted: string; surface: string; hover: string };
};

// The permissions grouped as the catalogue names them (projects.create → Projects)
const AREAS: Record<string, string> = {
    plugins: "System", settings: "System", jobs: "System", users: "System", roles: "System", groups: "System",
    audit: "System", storage: "System", projects: "Projects", files: "Files", facility: "Facility",
    assistant: "Assistant",
};

function permissionAreas(permissions: Permission[]): [string, Permission[]][] {
    const areas = new Map<string, Permission[]>();
    for (const permission of permissions) {
        const area = AREAS[permission.name.split(".")[0]] ?? "Other";
        areas.set(area, [...(areas.get(area) ?? []), permission]);
    }
    return Array.from(areas.entries());
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the old look props are still accepted
export default function RolesPanel(_styles: PanelStyles = {}) {
    const isDarkMode = useTheme().palette.mode === "dark";
    const { colors, fieldSx, actionButtonSx: actionSx, saveButtonSx: saveSx } = useSettingsStyles(isDarkMode);
    const sectionColors = { ...colors, hover: colors.hover };
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Role | "new" | null>(null);
    const [deleting, setDeleting] = useState<Role | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const areas = useMemo(() => permissionAreas(permissions), [permissions]);

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

    const tint = sectionTint(isDarkMode);
    const pill = (label: ReactNode, strong: boolean, key?: string) => (
        <Box key={key} component="span" sx={{
            display: "inline-flex", alignItems: "center", gap: 0.5, px: 1, py: 0.3, borderRadius: 999,
            fontSize: SETTINGS_TEXT.text, fontWeight: 600, border: "1px solid",
            borderColor: strong ? "transparent" : colors.border, bgcolor: strong ? tint : "transparent",
            color: strong ? colors.text : colors.muted,
        }}>
            {label}
        </Box>
    );

    return (
        <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <SettingsSection
                icon={<ShieldCheck size={19} />}
                title="Roles"
                subtitle="A role is a set of permissions. People hold the roles given to them and to their groups."
                actions={
                    <Stack direction="row" spacing={1}>
                        <Button size="small" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                disabled={loading} onClick={() => void load()}>
                            Reload
                        </Button>
                        <Button size="small" variant="contained" sx={saveSx} startIcon={<Plus size={15} />}
                                onClick={() => setEditing("new")}>
                            New role
                        </Button>
                    </Stack>
                }
                colors={sectionColors}
                isDarkMode={isDarkMode}
            >
                {roles.map((role) => {
                    const held = new Set(role.permissions);
                    return (
                        <Box key={role.id} data-testid={`role-${role.id}`} sx={{
                            display: "flex", gap: { xs: 1.25, md: 3 }, py: 2,
                            flexDirection: { xs: "column", md: "row" }, alignItems: { md: "center" },
                        }}>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                    <Typography sx={{ fontSize: SETTINGS_TEXT.title, fontWeight: 700, color: colors.text }}>
                                        {role.name}
                                    </Typography>
                                    {role.isSystem && pill(<><Lock size={13} />Built in</>, false)}
                                    {role.isDefault && pill(<><UserPlus size={13} />New accounts get it</>, false)}
                                </Stack>
                                {role.description && (
                                    <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted, mt: 0.25 }}>
                                        {role.description}
                                    </Typography>
                                )}
                                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                                    {role.isSystem
                                        ? pill("Every permission", true)
                                        : role.permissions.length === 0
                                            ? pill("No permissions", false)
                                            : areas.map(([area, items]) => {
                                                const count = items.filter((item) => held.has(item.name)).length;
                                                return count ? pill(`${area} ${count}/${items.length}`, true, area) : null;
                                            })}
                                </Stack>
                            </Box>
                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
                                <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted, whiteSpace: "nowrap" }}>
                                    {plural(role.usersCount, "person").replace("persons", "people")} · {plural(role.groupsCount, "group")}
                                </Typography>
                                {!role.isSystem && (
                                    <>
                                        <Button size="small" sx={actionSx} onClick={() => setEditing(role)}>
                                            Edit
                                        </Button>
                                        <Button size="small" sx={{ ...actionSx, color: "#dc2626" }}
                                                startIcon={<Trash2 size={15} />} onClick={() => setDeleting(role)}>
                                            Delete
                                        </Button>
                                    </>
                                )}
                            </Stack>
                        </Box>
                    );
                })}
            </SettingsSection>

            {deleting !== null && (
                <SettingsDialog
                    title="Delete role?"
                    description="This cannot be undone. Its people and groups lose its permissions."
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
                    <Box sx={{ border: "1px solid", borderColor: colors.border, borderLeft: "4px solid #dc2626", borderRadius: 2,
                               px: 1.5, py: 1.25 }}>
                        <Typography sx={{ fontSize: SETTINGS_TEXT.title, fontWeight: 800, color: colors.text }}>{deleting.name}</Typography>
                        {deleting.description && (
                            <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted }}>{deleting.description}</Typography>
                        )}
                        <Stack direction="row" spacing={2} sx={{ mt: 0.75, color: colors.muted }}>
                            <Stack direction="row" spacing={0.6} alignItems="center">
                                <UserPlus size={15} />
                                <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.text }}>
                                    {plural(deleting.usersCount, "person").replace("persons", "people")}
                                </Typography>
                            </Stack>
                            <Stack direction="row" spacing={0.6} alignItems="center">
                                <UsersRound size={15} />
                                <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.text }}>{plural(deleting.groupsCount, "group")}</Typography>
                            </Stack>
                            <Stack direction="row" spacing={0.6} alignItems="center">
                                <ShieldCheck size={15} />
                                <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.text }}>
                                    {plural(deleting.permissions.length, "permission")}
                                </Typography>
                            </Stack>
                        </Stack>
                    </Box>
                </SettingsDialog>
            )}

            {editing !== null && (
                <RoleDialog
                    actionButtonSx={actionSx}
                    saveButtonSx={saveSx}
                    role={editing === "new" ? null : editing}
                    permissions={permissions}
                    fieldSx={fieldSx}
                    colors={colors}
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

function RoleDialog({ role, permissions, fieldSx, colors, actionButtonSx, saveButtonSx, onClose, onSaved }: {
    colors: { border: string; text: string; muted: string; hover: string };
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
    const [search, setSearch] = useState("");
    const tint = sectionTint(useIsDark());
    const areas = useMemo(() => permissionAreas(permissions), [permissions]);
    // Words in any order, in what a permission does or in its name
    const shownAreas = useMemo(() => {
        const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) return areas;
        return areas
            .map(([area, items]) => [area, items.filter((permission) => {
                const text = `${area} ${permission.description} ${permission.name}`.toLowerCase();
                return words.every((word) => text.includes(word));
            })] as [string, Permission[]])
            .filter(([, items]) => items.length > 0);
    }, [areas, search]);

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
            closeButton
        >
            <Stack spacing={2}>
                <DialogPart icon={<KeyRound size={18} />} title="The role" tint={tint} colors={colors}
                            subtitle="A name people recognise, and what it is for.">
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="Name" value={name} autoFocus
                                   placeholder="Plugin keeper" onChange={(e) => setName(e.target.value)} />
                        <TextField sx={{ ...fieldSx, flex: 2 }} size="small" label="Description" value={description}
                                   placeholder="Who holds it, and why" onChange={(e) => setDescription(e.target.value)} />
                    </Stack>
                    <OptionRow title="Give it to new accounts" colors={colors} checked={isDefault} onChange={setIsDefault}
                               description="Every account made from now on holds it, besides what an administrator gives." />
                </DialogPart>

                <DialogPart icon={<ListChecks size={18} />} title="Permissions" tint={tint} colors={colors}
                            subtitle={`${chosen.size} of ${permissions.length} chosen. You can only give the ones you hold.`}>
                    <TextField sx={fieldSx} size="small" value={search} placeholder="Search a permission"
                               inputProps={{ "aria-label": "Search a permission" }} onChange={(e) => setSearch(e.target.value)}
                               InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
                    {shownAreas.length === 0 && (
                        <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted }}>No permission matches.</Typography>
                    )}
                    {shownAreas.map(([area, items]) => {
                        const all = areas.find(([name]) => name === area)?.[1] ?? items;
                        const chosenHere = all.filter((permission) => chosen.has(permission.name)).length;
                        return (
                            <Box key={area} role="group" aria-label={`Permissions: ${area}`}
                                 sx={{ border: "1px solid", borderColor: colors.border, borderRadius: 2, overflow: "hidden" }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}
                                       sx={{ px: 1.75, py: 0.75, bgcolor: colors.hover, borderBottom: "1px solid", borderColor: colors.border }}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography sx={{ fontSize: SETTINGS_TEXT.title, fontWeight: 700, color: colors.text }}>{area}</Typography>
                                        <Box component="span" sx={{ px: 1, borderRadius: 10, fontSize: 13, fontWeight: 700, lineHeight: 1.7,
                                                                    color: chosenHere ? "#2563eb" : colors.muted,
                                                                    bgcolor: chosenHere ? "rgba(37,99,235,0.12)" : "transparent",
                                                                    border: chosenHere ? "none" : `1px solid ${colors.border}` }}>
                                            {chosenHere}/{all.length}
                                        </Box>
                                    </Stack>
                                    <Button size="small" sx={{ ...(actionButtonSx ?? ROUNDED_BUTTON_SX), minWidth: 0 }}
                                            onClick={() => setArea(all, chosenHere < all.length)}>
                                        {chosenHere < all.length ? "Select all" : "Clear"}
                                    </Button>
                                </Stack>
                                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, columnGap: 1, px: 1, py: 0.5 }}>
                                    {items.map((permission) => (
                                        <FormControlLabel
                                            key={permission.name}
                                            sx={{ m: 0, alignItems: "flex-start", py: 0.25, borderRadius: 1.5,
                                                  "&:hover": { bgcolor: colors.hover } }}
                                            control={<Checkbox size="small" sx={{ pt: 0.5 }} checked={chosen.has(permission.name)}
                                                               onChange={() => toggle(permission.name)} />}
                                            label={
                                                <Box sx={{ pt: 0.6, pr: 1 }}>
                                                    <Typography sx={{ fontSize: SETTINGS_TEXT.control, lineHeight: 1.4, color: colors.text }}>
                                                        {permission.description}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: 13, color: colors.muted, fontFamily: "monospace" }}>
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
                </DialogPart>
            </Stack>
        </SettingsDialog>
    );
}
