import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import {
    Alert, Box, Button, Card, CardContent, CardHeader, CircularProgress, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import { Archive, CalendarClock, CheckCircle2, FolderOpen, RefreshCw, Trash2, Undo2 } from "lucide-react";
import toast from "react-hot-toast";

import SettingsDialog, { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import {
    deleteSessionProjects, listRetention, markRawDeleted, saveSessionRetention, unmarkRawDeleted,
    type RetentionKind, type RetentionList, type RetentionSession, type RetentionState,
} from "@/api/facility";
import { FACILITY_TEXT } from "./facilityStyles";
import { SESSION_STATUS_LABELS } from "./SessionsPanel";

type PanelStyles = {
    fieldSx: any;
    cardSx: any;
    cardHeaderSx: any;
    actionButtonSx?: any;
    saveButtonSx?: any;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};

type Filter = "attention" | "all" | "deleted";
const FILTER_LABELS: Record<Filter, string> = { attention: "To delete or due", all: "All finished", deleted: "Deleted" };
const KIND_LABELS: Record<RetentionKind, string> = { raw: "Raw movies", processed: "Projects" };
const STATE_COLORS: Record<RetentionState["state"], string> = {
    expired: "#dc2626", due: "#b45309", kept: "#16a34a", deleted: "#64748b", none: "#64748b", open: "#64748b",
};
const BUTTON_SX = { textTransform: "none", fontSize: FACILITY_TEXT.note, borderRadius: 2, py: 0.1, px: 1, minWidth: 0,
    lineHeight: 1.6, whiteSpace: "nowrap" } as const;

function formatDate(value: string | null | undefined): string {
    if (!value) return "";
    const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatBytes(bytes: number | null | undefined): string {
    if (!bytes) return "";
    if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/** What a kind of a session's data is now, in words. */
function describeRetention(state: RetentionState): string {
    switch (state.state) {
        case "deleted":
            return `Deleted ${formatDate(state.deletedAt)}${state.deletedBy ? ` by ${state.deletedBy}` : ""}`;
        case "none":
            return "No project";
        case "open":
            return "Not finished";
        case "expired": {
            const days = -(state.daysLeft ?? 0);
            return `Kept until ${formatDate(state.until)}: ${days} day${days === 1 ? "" : "s"} past, to delete`;
        }
        default:
            if (!state.until) return "Kept, with no date";
            if (state.daysLeft === 0) return `Kept until ${formatDate(state.until)}: the last day`;
            return `Kept until ${formatDate(state.until)} · ${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"} left`;
    }
}

const needsAttention = (session: RetentionSession) =>
    (["raw", "processed"] as RetentionKind[]).some((kind) => ["expired", "due"].includes(session[kind].state));
const allDeleted = (session: RetentionSession) =>
    (["raw", "processed"] as RetentionKind[]).every((kind) => ["deleted", "none"].includes(session[kind].state));

/**
 * How long the finished sessions' data are kept, for the staff: what is past its date (to delete), what is due, and
 * what was deleted. ScipionWeb deletes the projects (a button); the raw movies are deleted where the facility keeps
 * them, and recorded here.
 */
export default function RetentionPanel({ fieldSx, cardSx, cardHeaderSx, colors, actionButtonSx, saveButtonSx, canEdit }:
    PanelStyles & { canEdit: boolean }) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const [list, setList] = useState<RetentionList | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>("attention");
    const [dating, setDating] = useState<{ session: RetentionSession; kind: RetentionKind } | null>(null);
    const [marking, setMarking] = useState<RetentionSession | null>(null);
    const [deleting, setDeleting] = useState<RetentionSession | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setList(await listRetention());
            setError(null);
        } catch (e: any) {
            setError(String(e?.message || "Failed to load the data retention"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const replace = (session: RetentionSession) =>
        setList((current) => current && { ...current, sessions: current.sessions.map((other) => (other.id === session.id ? session : other)) });

    const counts = useMemo(() => ({
        attention: list?.sessions.filter(needsAttention).length ?? 0,
        all: list?.sessions.length ?? 0,
        deleted: list?.sessions.filter(allDeleted).length ?? 0,
    }), [list]);
    const shown = useMemo(() => (list?.sessions ?? []).filter((session) =>
        filter === "attention" ? needsAttention(session) : filter === "deleted" ? allDeleted(session) : true), [filter, list]);

    const run = async (action: () => Promise<RetentionSession>, done: string) => {
        setBusy(true);
        try {
            replace(await action());
            toast.success(done);
            return true;
        } catch (e: any) {
            toast.error(String(e?.message || "It did not work"));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const removeProjects = async (session: RetentionSession) => {
        setBusy(true);
        try {
            const result = await deleteSessionProjects(session.id);
            replace(result.session);
            if (result.failed.length) {
                toast.error(`${result.failed.length} project${result.failed.length === 1 ? "" : "s"} could not be deleted: `
                    + result.failed.map((project) => `${project.name} (${project.detail})`).join("; "), { duration: 9000 });
            } else {
                toast.success(`${result.deleted.length} project${result.deleted.length === 1 ? "" : "s"} deleted.`);
            }
            setDeleting(null);
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to delete the projects"));
        } finally {
            setBusy(false);
        }
    };

    if (error) return <Alert severity="error">{error}</Alert>;
    if (loading && !list) return <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>;
    if (!list) return null;

    const policy = [
        list.rawRetentionDays ? `raw movies ${list.rawRetentionDays} days` : "raw movies: no days set",
        list.processedRetentionDays ? `projects ${list.processedRetentionDays} days` : "projects: no days set",
    ].join(", ");
    const notices = list.retentionNoticeDays.length
        ? `its user and the group's PI are mailed ${list.retentionNoticeDays.join(", ")} days before`
        : "no notices are mailed";

    return (
        <Stack spacing={1.75}>
            <Card variant="outlined" sx={cardSx}>
                <CardHeader
                    title="Data retention"
                    subheader={`How long the finished sessions' data are kept after they finish (${policy}; ${notices}). Nothing is deleted by itself: past its date, delete a session's projects here, and record the raw movies once deleted where the facility keeps them.`}
                    sx={cardHeaderSx}
                    action={
                        <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                disabled={loading} onClick={() => void load()}>
                            Reload
                        </Button>
                    }
                />
                <CardContent sx={{ pt: 1.5 }}>
                    <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }}>
                        {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
                            <Button key={key} size="small" variant={filter === key ? "contained" : "outlined"}
                                    sx={filter === key ? saveButtonSx : actionSx} onClick={() => setFilter(key)}>
                                {FILTER_LABELS[key]} ({counts[key]})
                            </Button>
                        ))}
                    </Stack>
                    <Stack spacing={1.25}>
                        {shown.length === 0 && (
                            <Alert severity="info">
                                {filter === "attention" ? "No session's data are due or past their date." : "No session here."}
                            </Alert>
                        )}
                        {shown.map((session) => (
                            <RetentionRow key={session.id} session={session} colors={colors} canEdit={canEdit} busy={busy}
                                          onDate={(kind) => setDating({ session, kind })}
                                          onMarkRaw={() => setMarking(session)}
                                          onUnmarkRaw={() => void run(() => unmarkRawDeleted(session.id), "The record was undone.")}
                                          onDeleteProjects={() => setDeleting(session)} />
                        ))}
                    </Stack>
                </CardContent>
            </Card>

            {dating && (
                <DateDialog session={dating.session} kind={dating.kind} fieldSx={fieldSx} busy={busy} actionSx={actionSx}
                            saveButtonSx={saveButtonSx} onClose={() => setDating(null)}
                            onSave={async (value) => {
                                const key = dating.kind === "raw" ? "rawKeepUntil" : "processedKeepUntil";
                                if (await run(() => saveSessionRetention(dating.session.id, { [key]: value }),
                                    value ? "Saved: its user is told again before the new date." : "It follows the facility's days again.")) {
                                    setDating(null);
                                }
                            }} />
            )}

            {marking && (
                <SettingsDialog
                    title="Record the raw movies as deleted?"
                    description="ScipionWeb does not delete them: record it once they were deleted where the facility keeps them. It can be undone."
                    icon={<CheckCircle2 size={20} color="#86efac" />}
                    confirmLabel="Record as deleted"
                    busyLabel="Recording…"
                    busy={busy}
                    maxWidth="xs"
                    actionButtonSx={actionSx}
                    saveButtonSx={saveButtonSx}
                    onConfirm={() => void run(() => markRawDeleted(marking.id), "Recorded.").then((done) => done && setMarking(null))}
                    onClose={() => setMarking(null)}
                >
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine }}>
                        <strong>{marking.name}</strong> · {marking.movieCount} movies{marking.movieBytes ? `, ${formatBytes(marking.movieBytes)}` : ""}
                    </Typography>
                </SettingsDialog>
            )}

            {deleting && (
                <SettingsDialog
                    title="Delete the session's projects?"
                    description="Their folders and everything they computed go. This cannot be undone. A project you cannot manage stays, and you are told."
                    icon={<Trash2 size={20} color="#fca5a5" />}
                    confirmLabel="Delete the projects"
                    busyLabel="Deleting…"
                    busy={busy}
                    destructive
                    maxWidth="sm"
                    actionButtonSx={actionSx}
                    onConfirm={() => void removeProjects(deleting)}
                    onClose={() => setDeleting(null)}
                >
                    <Stack spacing={0.5}>
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine }}>
                            <strong>{deleting.name}</strong>
                            {deleting.processed.state !== "expired" && deleting.processed.until && (
                                <Box component="span" sx={{ color: STATE_COLORS.due, fontWeight: 700 }}>
                                    {" "}· kept until {formatDate(deleting.processed.until)}: its date has not passed
                                </Box>
                            )}
                        </Typography>
                        {deleting.projects.map((project) => (
                            <Typography key={project.id} sx={{ fontSize: FACILITY_TEXT.itemLine, fontFamily: "monospace" }}>
                                {project.name}{project.bytes ? ` · ${formatBytes(project.bytes)}` : ""}
                            </Typography>
                        ))}
                    </Stack>
                </SettingsDialog>
            )}
        </Stack>
    );
}

function StateBadge({ state }: { state: RetentionState }) {
    const color = STATE_COLORS[state.state];
    return (
        <Box sx={{ px: 0.8, py: 0.1, borderRadius: 10, border: `1px solid ${color}`, color, flexShrink: 0 }}>
            <Typography sx={{ fontSize: FACILITY_TEXT.badge, fontWeight: 700, whiteSpace: "nowrap" }}>
                {describeRetention(state)}
            </Typography>
        </Box>
    );
}

function RetentionRow({ session, colors, canEdit, busy, onDate, onMarkRaw, onUnmarkRaw, onDeleteProjects }: {
    session: RetentionSession;
    colors: PanelStyles["colors"];
    canEdit: boolean;
    busy: boolean;
    onDate: (kind: RetentionKind) => void;
    onMarkRaw: () => void;
    onUnmarkRaw: () => void;
    onDeleteProjects: () => void;
}) {
    const buttonSx = { ...BUTTON_SX, color: colors.text, borderColor: colors.border };
    const projectBytes = session.projects.reduce((total, project) => total + (project.bytes ?? 0), 0);
    const sent = (state: RetentionState) => state.noticesSent.length
        ? `Notices mailed ${state.noticesSent.join(", ")} days before.` : "";
    return (
        <Box data-testid={`retention-${session.id}`} sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.5 }}>
            <Stack spacing={0.75}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flexWrap: "wrap", rowGap: 0.5 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 800, fontFamily: "monospace", color: colors.text,
                                      wordBreak: "break-all" }}>
                        {session.name}
                    </Typography>
                    <Typography sx={{ fontSize: FACILITY_TEXT.badge, fontWeight: 700, color: colors.muted }}>
                        {session.status === "archived" && <Archive size={12} style={{ verticalAlign: "-1px", marginRight: 3 }} />}
                        {SESSION_STATUS_LABELS[session.status]}
                    </Typography>
                </Stack>
                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                    {[session.microscopeName, `finished ${formatDate(session.finishedOn)}`, session.userName || session.userEmail,
                      session.groupName && `group ${session.groupName}`].filter(Boolean).join(" · ")}
                </Typography>

                {(["raw", "processed"] as RetentionKind[]).map((kind) => {
                    const state = session[kind];
                    const size = kind === "raw"
                        ? [session.movieCount ? `${session.movieCount} movies` : "", formatBytes(session.movieBytes)].filter(Boolean).join(", ")
                        : [session.projects.length ? `${session.projects.length} project${session.projects.length === 1 ? "" : "s"}` : "",
                           formatBytes(projectBytes)].filter(Boolean).join(", ");
                    const live = state.state !== "deleted" && state.state !== "none";
                    return (
                        <Stack key={kind} direction="row" spacing={1} alignItems="center"
                               sx={{ minWidth: 0, flexWrap: "wrap", rowGap: 0.5, pl: 0.5 }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text, minWidth: 92 }}>
                                {KIND_LABELS[kind]}
                            </Typography>
                            <Tooltip arrow title={[state.own ? "Its own date, not the facility's days." : "", sent(state)].filter(Boolean).join(" ")}>
                                <Box><StateBadge state={state} /></Box>
                            </Tooltip>
                            {size && <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>{size}</Typography>}
                            {canEdit && (
                                <Stack direction="row" spacing={0.75} sx={{ ml: "auto !important" }}>
                                    {live && (
                                        <Button size="small" variant="outlined" sx={buttonSx} startIcon={<CalendarClock size={13} />}
                                                disabled={busy} onClick={() => onDate(kind)}>
                                            {state.own ? "Change date" : "Keep longer"}
                                        </Button>
                                    )}
                                    {kind === "raw" && live && (
                                        <Button size="small" variant="outlined" sx={buttonSx} startIcon={<CheckCircle2 size={13} />}
                                                disabled={busy} onClick={onMarkRaw}>
                                            Record as deleted
                                        </Button>
                                    )}
                                    {kind === "raw" && state.state === "deleted" && (
                                        <Button size="small" variant="outlined" sx={buttonSx} startIcon={<Undo2 size={13} />}
                                                disabled={busy} onClick={onUnmarkRaw}>
                                            Undo
                                        </Button>
                                    )}
                                    {kind === "processed" && session.projects.length > 0 && (
                                        <Button size="small" variant="outlined" startIcon={<Trash2 size={13} />} disabled={busy}
                                                sx={{ ...buttonSx, color: "#dc2626", borderColor: "#dc2626" }} onClick={onDeleteProjects}>
                                            Delete projects
                                        </Button>
                                    )}
                                </Stack>
                            )}
                        </Stack>
                    );
                })}

                {session.projects.length > 0 && (
                    <Stack direction="row" spacing={0.75} sx={{ pl: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
                        {session.projects.map((project) => (
                            <Button key={project.id} size="small" variant="outlined" component={RouterLink}
                                    to={`/project/load/${project.id}`} startIcon={<FolderOpen size={13} />}
                                    sx={{ ...buttonSx, fontFamily: "monospace" }}>
                                {project.name}{project.bytes ? ` · ${formatBytes(project.bytes)}` : ""}
                            </Button>
                        ))}
                    </Stack>
                )}
            </Stack>
        </Box>
    );
}

/** Give a kind of a session's data its own date, or give it back the facility's days. */
function DateDialog({ session, kind, fieldSx, busy, actionSx, saveButtonSx, onSave, onClose }: {
    session: RetentionSession;
    kind: RetentionKind;
    fieldSx: any;
    busy: boolean;
    actionSx: any;
    saveButtonSx: any;
    onSave: (value: string | null) => void;
    onClose: () => void;
}) {
    const state = session[kind];
    const [value, setValue] = useState(state.until ?? "");
    return (
        <SettingsDialog
            title={`Keep the ${kind === "raw" ? "raw movies" : "projects"} until`}
            description={`${session.name}: its user and the group's PI are told again before the new date.`}
            icon={<CalendarClock size={20} color="#93c5fd" />}
            confirmLabel="Save the date"
            busyLabel="Saving…"
            busy={busy}
            confirmDisabled={!value || value < session.finishedOn}
            maxWidth="xs"
            actionButtonSx={actionSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => onSave(value)}
            onClose={onClose}
        >
            <Stack spacing={1.25}>
                <TextField sx={fieldSx} size="small" type="date" label="Kept until" value={value}
                           InputLabelProps={{ shrink: true }} inputProps={{ min: session.finishedOn }}
                           onChange={(e) => setValue(e.target.value)} />
                {state.own && (
                    <Button size="small" variant="outlined" sx={actionSx} disabled={busy} onClick={() => onSave(null)}>
                        Use the facility's days again
                    </Button>
                )}
            </Stack>
        </SettingsDialog>
    );
}
