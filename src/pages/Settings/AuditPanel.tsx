import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    FormControl,
    InputAdornment,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { RefreshCw, ScrollText, Search } from "lucide-react";

import { listAuditCategories, listAuditEvents, type AuditEvent, type AuditQuery } from "@/api/access";
import { choiceButtonsSx, SETTINGS_TEXT, SettingsSection } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";

// The page may still pass its own look; the panel uses the shared Settings one
type PanelStyles = {
    fieldSx?: any;
    cardSx?: any;
    cardHeaderSx?: any;
    selectSx?: any;
    menuPaperSx?: any;
    actionButtonSx?: any;
    colors?: { border: string; text: string; muted: string; surface: string; hover: string };
};

type Period = "day" | "week" | "month" | "all";
const PERIOD_DAYS: Record<Period, number | null> = { day: 1, week: 7, month: 30, all: null };

// What each action says; an action not listed shows as it is
const ACTION_LABELS: Record<string, string> = {
    "auth.signIn": "Signed in",
    "auth.signInFailed": "Sign-in refused",
    "auth.signUp": "Signed up",
    "auth.passwordChanged": "Changed their password",
    "users.updated": "Changed an account",
    "roles.created": "Created a role",
    "roles.updated": "Changed a role",
    "roles.deleted": "Deleted a role",
    "groups.created": "Created a group",
    "groups.updated": "Changed a group",
    "groups.deleted": "Deleted a group",
    "projects.created": "Created a project",
    "projects.imported": "Imported a project",
    "projects.updated": "Changed a project",
    "projects.deleted": "Deleted a project",
    "projects.shared": "Shared a project",
    "projects.unshared": "Stopped sharing a project",
    "settings.instance": "Changed the instance settings",
    "settings.host": "Changed the host settings",
    "settings.environment": "Changed the environment",
    "plugins.installed": "Installed a plugin",
    "plugins.uninstalled": "Uninstalled a plugin",
    "plugins.binaryInstalled": "Installed a plugin binary",
    "plugins.binaryUninstalled": "Uninstalled a plugin binary",
    "jobs.worker": "Controlled a worker",
    "auth.identityLinked": "Linked a sign-in account",
    "users.deleted": "Deleted an account",
    "projects.fileUploaded": "Uploaded a file to a project",
    "settings.mailUpdated": "Changed the mail settings",
    "settings.assistantUpdated": "Changed the AI assistant settings",
    "assistant.actionApplied": "Applied an action the AI assistant proposed",
    "settings.notificationDefaultsUpdated": "Changed the default notifications",
    "settings.scratchUpdated": "Changed a scratch folder",
    "settings.signInProviderSaved": "Saved a way to sign in",
    "settings.signInProviderRemoved": "Removed a way to sign in",
    "storage.quotaUpdated": "Changed a disk quota",
    "facility.alertAcknowledged": "Acknowledged a facility alert",
    "facility.booking": "Booked a microscope",
    "facility.bookingUpdated": "Changed a booking",
    "facility.bookingCancelled": "Cancelled a booking",
    "facility.microscopeCreated": "Added a microscope",
    "facility.microscopeUpdated": "Changed a microscope",
    "facility.microscopeDeleted": "Deleted a microscope",
    "facility.navigationReportRequested": "Asked for a navigation report",
    "facility.resourceCreated": "Added a facility resource",
    "facility.resourceUpdated": "Changed a facility resource",
    "facility.resourceDeleted": "Deleted a facility resource",
    "facility.sampleCreated": "Added a sample",
    "facility.sampleUpdated": "Changed a sample",
    "facility.sampleDeleted": "Deleted a sample",
    "facility.sessionCreated": "Created a facility session",
    "facility.sessionUpdated": "Changed a facility session",
    "facility.sessionDeleted": "Deleted a facility session",
    "facility.settingsUpdated": "Changed the facility settings",
};

// A color per area, so the list can be scanned at a glance
const AREA_COLORS: Record<string, string> = {
    auth: "#2563eb", users: "#7c3aed", roles: "#7c3aed", groups: "#7c3aed", projects: "#0d9488",
    settings: "#d97706", plugins: "#db2777", jobs: "#64748b", storage: "#64748b", facility: "#16a34a",
};

const PAGE_SIZE = 100;

export function describeAuditValue(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (Array.isArray(value)) return value.map(describeAuditValue).join(", ");
    if (typeof value === "object") {
        const change = value as Record<string, unknown>;
        // A list change: what came and what went
        if ("added" in change || "removed" in change) {
            return [
                change.added ? `+ ${describeAuditValue(change.added)}` : "",
                change.removed ? `− ${describeAuditValue(change.removed)}` : "",
            ].filter(Boolean).join("; ");
        }
        return Object.entries(change).map(([key, inner]) => `${key}: ${describeAuditValue(inner)}`).join("; ");
    }
    return String(value);
}

function formatTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const day = date.toLocaleDateString();
    if (day === new Date().toLocaleDateString()) return "Today";
    if (day === new Date(Date.now() - 86_400_000).toLocaleDateString()) return "Yesterday";
    return date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the old look props are still accepted
export default function AuditPanel(_styles: PanelStyles = {}) {
    const isDarkMode = useTheme().palette.mode === "dark";
    const { colors, fieldSx, selectSx, menuPaperSx, actionButtonSx: actionSx } = useSettingsStyles(isDarkMode);
    const sectionColors = { ...colors, hover: colors.hover };
    const [categories, setCategories] = useState<{ name: string; description: string }[]>([]);
    const [category, setCategory] = useState("");
    const [period, setPeriod] = useState<Period>("all");
    const [text, setText] = useState("");
    // The search waits for the typing to stop
    const [searchText, setSearchText] = useState("");
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [nextBefore, setNextBefore] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (before: number | null = null) => {
        setLoading(true);
        setError(null);
        try {
            const query: AuditQuery = { action: category || undefined, text: searchText, before };
            const days = PERIOD_DAYS[period];
            if (days) query.since = new Date(Date.now() - days * 86_400_000).toISOString();
            const page = await listAuditEvents(query, PAGE_SIZE);
            setEvents((current) => (before == null ? page.events : [...current, ...page.events]));
            setNextBefore(page.nextBefore);
        } catch (e: any) {
            setError(String(e?.message || "Failed to load the audit log"));
        } finally {
            setLoading(false);
        }
    }, [category, searchText, period]);

    useEffect(() => {
        listAuditCategories().then(setCategories).catch(() => setCategories([]));
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => setSearchText(text), 300);
        return () => window.clearTimeout(timer);
    }, [text]);

    // A new kind, period or search starts again from the newest events
    useEffect(() => {
        void load(null);
    }, [load]);

    // The events under the day they happened
    const days = useMemo(() => {
        const grouped: { label: string; events: AuditEvent[] }[] = [];
        for (const event of events) {
            const label = dayLabel(event.createdAt);
            if (grouped.length && grouped[grouped.length - 1].label === label) grouped[grouped.length - 1].events.push(event);
            else grouped.push({ label, events: [event] });
        }
        return grouped;
    }, [events]);

    const cellSx = { fontSize: SETTINGS_TEXT.control, color: colors.text, borderColor: colors.border,
                     verticalAlign: "top", py: 1.1 } as const;
    const headSx = { fontSize: SETTINGS_TEXT.text, fontWeight: 700, color: colors.muted, bgcolor: colors.card,
                     borderColor: colors.border, whiteSpace: "nowrap" } as const;
    const muted = { fontSize: SETTINGS_TEXT.text, color: colors.muted } as const;

    return (
        <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <SettingsSection
                icon={<ScrollText size={19} />}
                title="Audit log"
                subtitle="Who did what: sign-ins, accounts, roles, groups, projects, settings, plugins, workers and the facility."
                actions={
                    <Button size="small" sx={actionSx} startIcon={<RefreshCw size={15} />}
                            disabled={loading} onClick={() => void load(null)}>
                        Reload
                    </Button>
                }
                colors={sectionColors}
                isDarkMode={isDarkMode}
                plain
            >
                <Stack spacing={1.75}>
                    <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} alignItems={{ lg: "center" }}>
                        <FormControl size="small" sx={{ minWidth: 240 }}>
                            <InputLabel id="audit-category-label" sx={{ fontSize: SETTINGS_TEXT.control }}>Kind</InputLabel>
                            <Select labelId="audit-category-label" label="Kind" sx={selectSx} value={category}
                                    MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                    onChange={(e) => setCategory(String(e.target.value))}>
                                <MenuItem value="">Everything</MenuItem>
                                {categories.map((item) => (
                                    <MenuItem key={item.name} value={item.name}>{item.description}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="Search" value={text}
                                   placeholder="An email, a project, a role…"
                                   onChange={(e) => setText(e.target.value)}
                                   InputProps={{ startAdornment: (
                                       <InputAdornment position="start"><Search size={16} /></InputAdornment>
                                   ) }} />
                        <ToggleButtonGroup exclusive size="small" value={period} aria-label="Period"
                                           onChange={(_, next) => next && setPeriod(next)}
                                           sx={choiceButtonsSx(sectionColors, isDarkMode)}>
                            <ToggleButton value="day">24 h</ToggleButton>
                            <ToggleButton value="week">7 days</ToggleButton>
                            <ToggleButton value="month">30 days</ToggleButton>
                            <ToggleButton value="all">All</ToggleButton>
                        </ToggleButtonGroup>
                    </Stack>

                    {events.length === 0 && !loading ? (
                        <Typography sx={{ ...muted, fontSize: SETTINGS_TEXT.control, py: 2 }}>No events.</Typography>
                    ) : (
                        <TableContainer sx={{ border: "1px solid", borderColor: colors.border, borderRadius: 2,
                                              maxHeight: { xs: 520, md: 640 }, overflowY: "auto" }}>
                            <Table size="small" stickyHeader aria-label="Audit log">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={headSx}>Time</TableCell>
                                        <TableCell sx={headSx}>Who</TableCell>
                                        <TableCell sx={headSx}>What</TableCell>
                                        <TableCell sx={headSx}>On</TableCell>
                                        <TableCell sx={headSx}>Details</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {days.flatMap((day) => [
                                        <TableRow key={`day-${day.label}-${day.events[0].id}`}>
                                            <TableCell colSpan={5} sx={{
                                                borderColor: colors.border, py: 0.75, fontSize: SETTINGS_TEXT.text,
                                                fontWeight: 700, color: colors.text,
                                                bgcolor: isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(17,24,39,0.035)",
                                            }}>
                                                {day.label}
                                            </TableCell>
                                        </TableRow>,
                                        ...day.events.map((event) => {
                                            const area = event.action.split(".")[0];
                                            const refused = event.action === "auth.signInFailed";
                                            return (
                                                <TableRow key={event.id} hover>
                                                    <TableCell sx={{ ...cellSx, whiteSpace: "nowrap", color: colors.muted }}
                                                               title={new Date(event.createdAt).toLocaleString()}>
                                                        {formatTime(event.createdAt)}
                                                    </TableCell>
                                                    <TableCell sx={cellSx}>
                                                        {event.userEmail ?? "—"}
                                                        {event.clientAddress && (
                                                            <Typography sx={muted}>{event.clientAddress}</Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }} title={event.action}>
                                                        <Stack direction="row" spacing={1} alignItems="center">
                                                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                                                                       bgcolor: refused ? "#dc2626" : AREA_COLORS[area] ?? "#94a3b8" }} />
                                                            <Typography sx={{ fontSize: SETTINGS_TEXT.control, fontWeight: 600,
                                                                              color: refused ? "#dc2626" : colors.text }}>
                                                                {ACTION_LABELS[event.action] ?? event.action}
                                                            </Typography>
                                                        </Stack>
                                                    </TableCell>
                                                    <TableCell sx={cellSx}>
                                                        {event.targetName ?? (event.targetId ? `#${event.targetId}` : "—")}
                                                    </TableCell>
                                                    <TableCell sx={{ ...cellSx, color: colors.muted, wordBreak: "break-word" }}>
                                                        {Object.keys(event.details ?? {}).length
                                                            ? describeAuditValue(event.details)
                                                            : "—"}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        }),
                                    ])}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 36 }}>
                        <Typography sx={muted}>
                            {events.length ? `${events.length} event${events.length === 1 ? "" : "s"} shown` : ""}
                        </Typography>
                        {loading ? (
                            <CircularProgress size={22} />
                        ) : nextBefore != null ? (
                            <Button size="small" sx={actionSx} onClick={() => void load(nextBefore)}>
                                Older events
                            </Button>
                        ) : events.length ? (
                            <Typography sx={muted}>That is all.</Typography>
                        ) : null}
                    </Stack>
                </Stack>
            </SettingsSection>
        </Stack>
    );
}
