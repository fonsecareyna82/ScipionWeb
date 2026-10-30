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
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import { RefreshCw } from "lucide-react";

import { listAuditCategories, listAuditEvents, type AuditEvent } from "@/api/access";
import { ROUNDED_BUTTON_SX } from "./SettingsDialog";

type PanelStyles = {
    fieldSx: any;
    cardSx: any;
    cardHeaderSx: any;
    selectSx: any;
    menuPaperSx: any;
    actionButtonSx?: any;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};

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

function formatWhen(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AuditPanel({ fieldSx, cardSx, cardHeaderSx, selectSx, menuPaperSx, actionButtonSx,
                                     colors }: PanelStyles) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const [categories, setCategories] = useState<{ name: string; description: string }[]>([]);
    const [category, setCategory] = useState("");
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
            const page = await listAuditEvents({ action: category || undefined, text: searchText, before }, PAGE_SIZE);
            setEvents((current) => (before == null ? page.events : [...current, ...page.events]));
            setNextBefore(page.nextBefore);
        } catch (e: any) {
            setError(String(e?.message || "Failed to load the audit log"));
        } finally {
            setLoading(false);
        }
    }, [category, searchText]);

    useEffect(() => {
        listAuditCategories().then(setCategories).catch(() => setCategories([]));
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => setSearchText(text), 300);
        return () => window.clearTimeout(timer);
    }, [text]);

    // A new kind or search starts again from the newest events
    useEffect(() => {
        void load(null);
    }, [load]);

    const cellSx = { fontSize: 12.5, color: colors.text, borderColor: colors.border, verticalAlign: "top" };
    const headSx = { ...cellSx, fontWeight: 800, color: colors.muted };

    return (
        <Stack spacing={1.75}>
            {error && <Alert severity="error">{error}</Alert>}
            <Card variant="outlined" sx={cardSx}>
                <CardHeader
                    title="Audit log"
                    subheader="Who did what: sign-ins, accounts, roles, groups, sharing, settings, plugins and workers."
                    sx={cardHeaderSx}
                    action={
                        <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                disabled={loading} onClick={() => void load(null)}>
                            Reload
                        </Button>
                    }
                />
                <CardContent sx={{ pt: 2 }}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mb: 2 }}>
                        <FormControl size="small" sx={{ minWidth: 220 }}>
                            <InputLabel id="audit-category-label">Kind</InputLabel>
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
                                   onChange={(e) => setText(e.target.value)} />
                    </Stack>

                    {events.length === 0 && !loading ? (
                        <Alert severity="info">No events.</Alert>
                    ) : (
                        <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 2 }}>
                            <Table size="small" aria-label="Audit log">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={headSx}>When</TableCell>
                                        <TableCell sx={headSx}>Who</TableCell>
                                        <TableCell sx={headSx}>What</TableCell>
                                        <TableCell sx={headSx}>On</TableCell>
                                        <TableCell sx={headSx}>Details</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {events.map((event) => (
                                        <TableRow key={event.id}>
                                            <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                                                {formatWhen(event.createdAt)}
                                            </TableCell>
                                            <TableCell sx={cellSx}>
                                                {event.userEmail ?? "—"}
                                                {event.clientAddress && (
                                                    <Typography sx={{ fontSize: 11, color: colors.muted }}>
                                                        {event.clientAddress}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell sx={cellSx} title={event.action}>
                                                {ACTION_LABELS[event.action] ?? event.action}
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
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    <Box sx={{ display: "flex", justifyContent: "center", mt: 1.5, minHeight: 32 }}>
                        {loading ? (
                            <CircularProgress size={22} />
                        ) : nextBefore != null ? (
                            <Button size="small" variant="outlined" sx={actionSx} onClick={() => void load(nextBefore)}>
                                Older events
                            </Button>
                        ) : null}
                    </Box>
                </CardContent>
            </Card>
        </Stack>
    );
}
