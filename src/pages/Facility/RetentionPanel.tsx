import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link as RouterLink } from "react-router";
import {
    Alert, Box, Button, CircularProgress, IconButton, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import {
    Archive, BellRing, CalendarClock, CalendarDays, CheckCircle2, Clapperboard, Copy, Info, FolderKanban, FolderOpen, HardDrive,
    Microscope as MicroscopeIcon, RefreshCw, RotateCcw, Trash2, Undo2, UserRound, UsersRound,
} from "lucide-react";
import toast from "react-hot-toast";

import SettingsDialog, { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import {
    deleteSessionProjects, listRetention, markRawDeleted, saveSessionRetention, unmarkRawDeleted,
    type RawFolder, type RetentionKind, type RetentionList, type RetentionSession, type RetentionState,
} from "@/api/facility";
import { useIsDark } from "@/context/ThemeContext";
import { SettingsSection, choiceButtonsSx, sectionTint } from "@/pages/Settings/SettingsSection";
import { FACILITY_TEXT, useFacilityStyles } from "./facilityStyles";
import { SessionFacts, SessionStatusPill, copyFolders, type SessionFact } from "./SessionsPanel";

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
const KIND_ICONS: Record<RetentionKind, typeof Clapperboard> = { raw: Clapperboard, processed: FolderKanban };
const KIND_LABELS: Record<RetentionKind, string> = { raw: "Raw movies", processed: "Projects" };
const STATE_COLORS: Record<RetentionState["state"], string> = {
    expired: "#dc2626", due: "#b45309", kept: "#16a34a", deleted: "#64748b", none: "#64748b", open: "#64748b",
};
const BUTTON_SX = { textTransform: "none", fontSize: FACILITY_TEXT.note, borderRadius: 2, py: 0.25, px: 1.25, minWidth: 0,
    lineHeight: 1.6, whiteSpace: "nowrap" } as const;
// How far a date can be moved with one click
const QUICK_MONTHS = [1, 3, 6, 12];

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
const projectBytesOf = (session: RetentionSession) => session.projects.reduce((total, project) => total + (project.bytes ?? 0), 0);

/** The colour of a session's band: its worst state. */
function worstColor(session: RetentionSession): string {
    const states = [session.raw.state, session.processed.state];
    for (const state of ["expired", "due", "kept"] as const) if (states.includes(state)) return STATE_COLORS[state];
    return STATE_COLORS.deleted;
}

function plural(count: number, one: string, many = `${one}s`): string {
    return `${count} ${count === 1 ? one : many}`;
}

/** A day (YYYY-MM-DD) moved by some months and days. */
function moveDay(day: string, { months = 0, days = 0 }: { months?: number; days?: number }): string {
    const date = new Date(`${day}T00:00:00`);
    date.setMonth(date.getMonth() + months);
    date.setDate(date.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** One figure of the facility's rules or of what waits, in a small tile. */
function Tile({ icon, label, value, color, colors }: {
    icon: ReactNode;
    label: string;
    value: string;
    color?: string;
    colors: { border: string; text: string; muted: string };
}) {
    return (
        <Box sx={{ flex: "1 1 170px", border: `1px solid ${colors.border}`, borderRadius: 2, px: 1.5, py: 1.1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: color ?? colors.muted }}>
                {icon}
                <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 700, color: colors.muted }}>{label}</Typography>
            </Stack>
            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle + 1, fontWeight: 800, color: color ?? colors.text, mt: 0.25 }}>
                {value}
            </Typography>
        </Box>
    );
}

/**
 * How long the finished sessions' data are kept, for the staff: what is past its date (to delete), what is due, and
 * what was deleted. ScipionWeb deletes the projects (a button); the raw movies are deleted where the facility keeps
 * them, and recorded here.
 */
export default function RetentionPanel({ fieldSx, colors, actionButtonSx, saveButtonSx, canEdit }:
    PanelStyles & { canEdit: boolean }) {
    const isDark = useIsDark();
    const sectionColors = { ...useFacilityStyles().colors, ...colors };
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
    // What is past its date, and the space deleting it frees
    const toFree = useMemo(() => {
        let bytes = 0;
        let sessions = 0;
        for (const session of list?.sessions ?? []) {
            const raw = session.raw.state === "expired";
            const processed = session.processed.state === "expired";
            if (raw) bytes += session.movieBytes ?? 0;
            if (processed) bytes += projectBytesOf(session);
            if (raw || processed) sessions += 1;
        }
        return { bytes, sessions };
    }, [list]);

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

    const reload = (
        <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                disabled={loading} onClick={() => void load()}>
            Reload
        </Button>
    );

    return (
        <Stack spacing={2}>
            <SettingsSection
                plain
                icon={<Archive size={19} />}
                title="Data retention"
                subtitle="How long the finished sessions' data are kept. Nothing is deleted by itself: past its date, delete a session's projects here, and record the raw movies once deleted where the facility keeps them."
                colors={sectionColors}
                isDarkMode={isDark}
                actions={reload}
            >
                {error && <Alert severity="error">{error}</Alert>}
                {!error && loading && !list && (
                    <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>
                )}
                {!error && list && (
                    <Stack spacing={1.5}>
                        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1.25} aria-label="The facility's days">
                            <Tile icon={<Clapperboard size={16} />} label="Raw movies kept" colors={colors}
                                  value={list.rawRetentionDays ? plural(list.rawRetentionDays, "day") : "No days set"} />
                            <Tile icon={<FolderKanban size={16} />} label="Projects kept" colors={colors}
                                  value={list.processedRetentionDays ? plural(list.processedRetentionDays, "day") : "No days set"} />
                            <Tile icon={<BellRing size={16} />} label="User and PI told" colors={colors}
                                  value={list.retentionNoticeDays.length ? `${list.retentionNoticeDays.join(", ")} days before` : "Not told"} />
                            <Tile icon={<HardDrive size={16} />} label="Past its date" colors={colors}
                                  color={toFree.sessions ? STATE_COLORS.expired : undefined}
                                  value={toFree.sessions
                                      ? `${plural(toFree.sessions, "session")}${toFree.bytes ? ` · ${formatBytes(toFree.bytes)}` : ""}`
                                      : "Nothing"} />
                        </Stack>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: colors.muted, pt: 0.25, pb: 0.5 }}>
                            <Info size={15} style={{ flexShrink: 0 }} />
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                Counted from the day a session finished. The days are set in Configuration.
                            </Typography>
                        </Stack>

                        <ToggleButtonGroup exclusive size="small" value={filter} aria-label="Sessions shown"
                                           onChange={(_, value) => value && setFilter(value as Filter)}
                                           sx={{ ...choiceButtonsSx({ ...sectionColors, hover: colors.hover }, isDark), alignSelf: "flex-start" }}>
                            {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
                                <ToggleButton key={key} value={key}>{FILTER_LABELS[key]} ({counts[key]})</ToggleButton>
                            ))}
                        </ToggleButtonGroup>

                        {shown.length === 0 && (
                            <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 3, textAlign: "center" }}>
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                                    {filter === "attention" ? "Nothing to delete or due." : "No session here."}
                                </Typography>
                                {filter === "attention" && (
                                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.5 }}>
                                        No session's data are past their date or close to it.
                                    </Typography>
                                )}
                            </Box>
                        )}
                        {shown.map((session) => (
                            <RetentionRow key={session.id} session={session} colors={colors} card={sectionColors.card}
                                          canEdit={canEdit} busy={busy}
                                          onDate={(kind) => setDating({ session, kind })}
                                          onMarkRaw={() => setMarking(session)}
                                          onUnmarkRaw={() => void run(() => unmarkRawDeleted(session.id), "The record was undone.")}
                                          onDeleteProjects={() => setDeleting(session)} />
                        ))}
                    </Stack>
                )}
            </SettingsSection>

            {dating && list && (
                <DateDialog session={dating.session} kind={dating.kind} fieldSx={fieldSx} busy={busy} actionSx={actionSx}
                            saveButtonSx={saveButtonSx} today={list.today} colors={colors} isDark={isDark}
                            facilityDays={dating.kind === "raw" ? list.rawRetentionDays : list.processedRetentionDays}
                            onClose={() => setDating(null)}
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
                    description="ScipionWeb does not delete them: record it once they were deleted where the facility keeps them."
                    icon={<CheckCircle2 size={20} color="#86efac" />}
                    confirmLabel="Record as deleted"
                    busyLabel="Recording…"
                    busy={busy}
                    maxWidth="sm"
                    actionButtonSx={actionSx}
                    saveButtonSx={saveButtonSx}
                    closeButton
                    onConfirm={() => void run(() => markRawDeleted(marking.id), "Recorded.").then((done) => done && setMarking(null))}
                    onClose={() => setMarking(null)}
                >
                    <Stack spacing={1.25}>
                        <Box sx={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${STATE_COLORS[marking.raw.state]}`,
                                   borderRadius: 2, px: 1.5, py: 1.25 }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 800, fontFamily: "monospace", wordBreak: "break-all" }}>
                                {marking.name}
                            </Typography>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, color: colors.muted }}>
                                <Clapperboard size={15} />
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text }}>
                                    {[plural(marking.movieCount ?? 0, "movie"), formatBytes(marking.movieBytes)].filter(Boolean).join(", ")}
                                </Typography>
                            </Stack>
                            <Box sx={{ mt: 0.75 }}><StateBadge state={marking.raw} /></Box>
                        </Box>
                        <RawFolders folders={marking.rawFolders ?? []} colors={colors} />
                        {(() => {
                            const still = (marking.rawFolders ?? []).filter((folder) => folder.present).length;
                            return still > 0 && (
                                <Alert severity="warning" sx={{ fontSize: FACILITY_TEXT.note }}>
                                    {still === 1 ? "One of its folders is" : `${still} of its folders are`} still there: delete {still === 1 ? "it" : "them"} first.
                                </Alert>
                            );
                        })()}
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                            Its user is not told again. You can undo it from the list.
                        </Typography>
                    </Stack>
                </SettingsDialog>
            )}

            {deleting && (
                <SettingsDialog
                    title="Delete the session's projects?"
                    description="Their folders and everything they computed go. This cannot be undone."
                    icon={<Trash2 size={20} color="#fca5a5" />}
                    confirmLabel="Delete the projects"
                    busyLabel="Deleting…"
                    busy={busy}
                    destructive
                    maxWidth="sm"
                    actionButtonSx={actionSx}
                    closeButton
                    onConfirm={() => void removeProjects(deleting)}
                    onClose={() => setDeleting(null)}
                >
                    <Stack spacing={1.25}>
                        {deleting.processed.state !== "expired" && deleting.processed.until && (
                            <Alert severity="warning" sx={{ fontSize: FACILITY_TEXT.note }}>
                                {deleting.name} · kept until {formatDate(deleting.processed.until)}: its date has not passed
                            </Alert>
                        )}
                        <Box sx={{ border: `1px solid ${colors.border}`, borderLeft: "4px solid #dc2626", borderRadius: 2, overflow: "hidden" }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between"
                                   sx={{ px: 1.5, py: 1, bgcolor: colors.hover, borderBottom: `1px solid ${colors.border}` }}>
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 800, fontFamily: "monospace", wordBreak: "break-all" }}>
                                    {deleting.name}
                                </Typography>
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 700, color: colors.muted, whiteSpace: "nowrap", ml: 1 }}>
                                    {[plural(deleting.projects.length, "project"), formatBytes(projectBytesOf(deleting))].filter(Boolean).join(" · ")}
                                </Typography>
                            </Stack>
                            {deleting.projects.map((project, index) => (
                                <Stack key={project.id} direction="row" spacing={1} alignItems="center"
                                       sx={{ px: 1.5, py: 0.9, borderTop: index ? `1px solid ${colors.border}` : "none" }}>
                                    <FolderKanban size={15} style={{ color: colors.muted, flexShrink: 0 }} />
                                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontFamily: "monospace", flex: 1, minWidth: 0,
                                                      wordBreak: "break-all" }}>
                                        {project.name}
                                    </Typography>
                                    {project.bytes ? (
                                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, whiteSpace: "nowrap" }}>
                                            {formatBytes(project.bytes)}
                                        </Typography>
                                    ) : null}
                                </Stack>
                            ))}
                        </Box>
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                            A project you cannot manage stays, and you are told which.
                        </Typography>
                    </Stack>
                </SettingsDialog>
            )}
        </Stack>
    );
}

/** Where a session's raw movies are: each DATA's folder, to copy and delete there, and whether it is still there. */
function RawFolders({ folders, colors }: { folders: RawFolder[]; colors: PanelStyles["colors"] }) {
    const paths = folders.map((folder) => folder.path).filter((path): path is string => Boolean(path));
    if (!folders.length) return null;
    return (
        <Box aria-label="Where the raw movies are" role="group">
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 700, color: colors.muted }}>Where they are</Typography>
                {paths.length > 1 && (
                    <Button size="small" variant="text" startIcon={<Copy size={14} />}
                            sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note }}
                            onClick={() => copyFolders(paths.join("\n"), "Folders")}>
                        Copy all
                    </Button>
                )}
            </Stack>
            <Stack spacing={0.25}>
                {folders.map((folder) => (
                    <Stack key={folder.folder} direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                        {folder.path ? (
                            <Tooltip arrow title="Copy the folder">
                                <IconButton size="small" aria-label={`Copy ${folder.path}`}
                                            onClick={() => copyFolders(folder.path as string, folder.folder)}>
                                    <Copy size={14} />
                                </IconButton>
                            </Tooltip>
                        ) : <Box sx={{ width: 30, flexShrink: 0 }} />}
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontFamily: "monospace", color: colors.text, minWidth: 0,
                                          wordBreak: "break-all", opacity: folder.present ? 1 : 0.6 }}>
                            {folder.path ?? folder.folder}
                        </Typography>
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, whiteSpace: "nowrap" }}>
                            {[folder.movieCount ? plural(folder.movieCount, "movie") : "", formatBytes(folder.movieBytes)]
                                .filter(Boolean).join(", ")}
                        </Typography>
                        {!folder.path && (
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: STATE_COLORS.due, whiteSpace: "nowrap" }}>
                                its microscope has no offload folder
                            </Typography>
                        )}
                        {folder.path && !folder.present && (
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 700, color: colors.muted, whiteSpace: "nowrap" }}>
                                not there any more
                            </Typography>
                        )}
                    </Stack>
                ))}
            </Stack>
        </Box>
    );
}

function StateBadge({ state }: { state: RetentionState }) {
    const color = STATE_COLORS[state.state];
    return (
        <Box component="span" sx={{ display: "inline-block", px: 1, borderRadius: 10, color, bgcolor: `${color}1f`, flexShrink: 0,
                                    fontSize: FACILITY_TEXT.badge, fontWeight: 700, lineHeight: 1.8, whiteSpace: "nowrap" }}>
            {describeRetention(state)}
        </Box>
    );
}

function RetentionRow({ session, colors, card, canEdit, busy, onDate, onMarkRaw, onUnmarkRaw, onDeleteProjects }: {
    session: RetentionSession;
    colors: PanelStyles["colors"];
    card: string;
    canEdit: boolean;
    busy: boolean;
    onDate: (kind: RetentionKind) => void;
    onMarkRaw: () => void;
    onUnmarkRaw: () => void;
    onDeleteProjects: () => void;
}) {
    const buttonSx = { ...BUTTON_SX, color: colors.text, borderColor: colors.border };
    const projectBytes = projectBytesOf(session);
    const sent = (state: RetentionState) => state.noticesSent.length
        ? `Notices mailed ${state.noticesSent.join(", ")} days before.` : "";
    const facts: SessionFact[] = [
        { icon: <MicroscopeIcon size={15} />, text: session.microscopeName ?? "" },
        { icon: <CalendarDays size={15} />, text: `finished ${formatDate(session.finishedOn)}` },
        { icon: <UserRound size={15} />, text: session.userName || session.userEmail || "" },
        { icon: <UsersRound size={15} />, text: session.groupName ? `group ${session.groupName}` : "" },
    ];
    return (
        <Box data-testid={`retention-${session.id}`}
             sx={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${worstColor(session)}`, borderRadius: 2.5,
                   bgcolor: card, overflow: "hidden" }}>
            <Stack spacing={0.75} sx={{ px: 2, pt: 1.5, pb: 1.25 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flexWrap: "wrap", rowGap: 0.5 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle + 0.5, fontWeight: 800, fontFamily: "monospace", color: colors.text,
                                      wordBreak: "break-all" }}>
                        {session.name}
                    </Typography>
                    <SessionStatusPill status={session.status} />
                </Stack>
                <SessionFacts facts={facts} colors={colors} />
            </Stack>

            <Box sx={{ borderTop: `1px solid ${colors.border}`, bgcolor: colors.hover }}>
                {(["raw", "processed"] as RetentionKind[]).map((kind, index) => {
                    const state = session[kind];
                    const Icon = KIND_ICONS[kind];
                    const size = kind === "raw"
                        ? [session.movieCount ? `${session.movieCount} movies` : "", formatBytes(session.movieBytes)].filter(Boolean).join(", ")
                        : [session.projects.length ? plural(session.projects.length, "project") : "", formatBytes(projectBytes)]
                            .filter(Boolean).join(", ");
                    const live = state.state !== "deleted" && state.state !== "none";
                    const tip = [state.own ? "Its own date, not the facility's days." : "", sent(state)].filter(Boolean).join(" ");
                    return (
                        <Box key={kind} role="group" aria-label={KIND_LABELS[kind]}
                             sx={{ px: 2, py: 1, borderTop: index ? `1px solid ${colors.border}` : "none" }}>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1, flexWrap: "wrap", rowGap: 0.5 }}>
                                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 120, color: colors.muted }}>
                                        <Icon size={16} />
                                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text }}>
                                            {KIND_LABELS[kind]}
                                        </Typography>
                                    </Stack>
                                    <Tooltip arrow title={tip}>
                                        <Box component="span"><StateBadge state={state} /></Box>
                                    </Tooltip>
                                    {state.own && live && (
                                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>own date</Typography>
                                    )}
                                    {size && <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>{size}</Typography>}
                                </Stack>
                                {canEdit && (
                                    <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
                                        {live && (
                                            <Button size="small" variant="outlined" sx={buttonSx} startIcon={<CalendarClock size={14} />}
                                                    disabled={busy} onClick={() => onDate(kind)}>
                                                {state.own ? "Change date" : "Keep longer"}
                                            </Button>
                                        )}
                                        {kind === "raw" && live && (
                                            <Button size="small" variant="outlined" sx={buttonSx} startIcon={<CheckCircle2 size={14} />}
                                                    disabled={busy} onClick={onMarkRaw}>
                                                Record as deleted
                                            </Button>
                                        )}
                                        {kind === "raw" && state.state === "deleted" && (
                                            <Button size="small" variant="outlined" sx={buttonSx} startIcon={<Undo2 size={14} />}
                                                    disabled={busy} onClick={onUnmarkRaw}>
                                                Undo
                                            </Button>
                                        )}
                                        {kind === "processed" && session.projects.length > 0 && (
                                            <Button size="small" variant="outlined" startIcon={<Trash2 size={14} />} disabled={busy}
                                                    sx={{ ...buttonSx, color: "#dc2626", borderColor: "#dc2626" }} onClick={onDeleteProjects}>
                                                Delete projects
                                            </Button>
                                        )}
                                    </Stack>
                                )}
                            </Stack>
                            {kind === "raw" && live && canEdit && (session.rawFolders?.length ?? 0) > 0 && (
                                <Box sx={{ mt: 0.5 }}><RawFolders folders={session.rawFolders ?? []} colors={colors} /></Box>
                            )}
                            {kind === "processed" && session.projects.length > 0 && (
                                <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 0.5 }}>
                                    {session.projects.map((project) => (
                                        <Button key={project.id} size="small" variant="outlined" component={RouterLink}
                                                to={`/project/load/${project.id}`} startIcon={<FolderOpen size={14} />}
                                                sx={{ ...buttonSx, fontFamily: "monospace", bgcolor: card }}>
                                            {project.name}{project.bytes ? ` · ${formatBytes(project.bytes)}` : ""}
                                        </Button>
                                    ))}
                                </Stack>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}

/** Give a kind of a session's data its own date, or give it back the facility's days. */
function DateDialog({ session, kind, fieldSx, busy, actionSx, saveButtonSx, today, facilityDays, colors, isDark, onSave, onClose }: {
    session: RetentionSession;
    kind: RetentionKind;
    fieldSx: any;
    busy: boolean;
    actionSx: any;
    saveButtonSx: any;
    today: string;
    facilityDays: number | null | undefined;
    colors: PanelStyles["colors"];
    isDark: boolean;
    onSave: (value: string | null) => void;
    onClose: () => void;
}) {
    const state = session[kind];
    const [value, setValue] = useState(state.until ?? "");
    // The quick moves start from the later of the date kept and today
    const base = state.until && state.until > today ? state.until : today;
    const facilityUntil = facilityDays ? formatDate(moveDay(session.finishedOn, { days: facilityDays })) : "";
    const what = kind === "raw" ? "raw movies" : "projects";
    return (
        <SettingsDialog
            title={`Keep the ${what} until`}
            description={`${session.name}: its user and the group's PI are told again before the new date.`}
            icon={<CalendarClock size={20} color="#93c5fd" />}
            confirmLabel="Save the date"
            busyLabel="Saving…"
            busy={busy}
            confirmDisabled={!value || value < session.finishedOn}
            maxWidth="xs"
            actionButtonSx={actionSx}
            saveButtonSx={saveButtonSx}
            closeButton
            onConfirm={() => onSave(value)}
            onClose={onClose}
        >
            <Stack spacing={1.75}>
                <Box sx={{ borderRadius: 2, bgcolor: sectionTint(isDark), px: 1.5, py: 1.1 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mb: 0.5 }}>Now</Typography>
                    <StateBadge state={state} />
                </Box>
                <TextField sx={fieldSx} size="small" type="date" label="Kept until" value={value}
                           InputLabelProps={{ shrink: true }} inputProps={{ min: session.finishedOn }}
                           onChange={(e) => setValue(e.target.value)} />
                <Box>
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mb: 0.75 }}>
                        Or move it from {formatDate(base)}:
                    </Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                        {QUICK_MONTHS.map((months) => {
                            const next = moveDay(base, { months });
                            return (
                                <Button key={months} size="small" variant={value === next ? "contained" : "outlined"}
                                        sx={value === next ? { ...saveButtonSx, ...BUTTON_SX } : { ...BUTTON_SX, color: colors.text, borderColor: colors.border }}
                                        onClick={() => setValue(next)}>
                                    {months === 12 ? "+1 year" : `+${plural(months, "month")}`}
                                </Button>
                            );
                        })}
                    </Stack>
                </Box>
                {state.own && (
                    <Box sx={{ borderTop: `1px solid ${colors.border}`, pt: 1.5 }}>
                        <Button size="small" variant="outlined" sx={actionSx} disabled={busy} startIcon={<RotateCcw size={14} />}
                                onClick={() => onSave(null)}>
                            Use the facility's days again
                        </Button>
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.75 }}>
                            {facilityDays
                                ? `${plural(facilityDays, "day")} after it finished: until ${facilityUntil}.`
                                : "The facility has no days set: kept with no date."}
                        </Typography>
                    </Box>
                )}
            </Stack>
        </SettingsDialog>
    );
}
