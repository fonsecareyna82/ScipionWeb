import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography, type SxProps, type Theme } from "@mui/material";
import {
    Archive, CalendarDays, Download, FlaskConical, Layers, MessageSquare, Microscope as MicroscopeIcon, RefreshCw, Ticket,
    UserRound, UsersRound,
} from "lucide-react";

import { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import { getMyFacility, type MyFacility, type RetentionKind, type SessionDataset, type UserSession } from "@/api/facility";
import { useIsDark } from "@/context/ThemeContext";
import { SettingsSection } from "@/pages/Settings/SettingsSection";
import { FACILITY_TEXT, useFacilityStyles } from "./facilityStyles";
import {
    DatasetProgress, DatasetProjectLinks, describeDatasetGrid, SessionFacts, SessionStatusPill, sessionCardSx, type SessionFact,
} from "./SessionsPanel";
import NavigationReport from "./NavigationReport";

type PanelStyles = {
    actionButtonSx?: SxProps<Theme>;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};

const TECHNIQUE_LABELS = { spa: "SPA", tomo: "Tomography" } as const;
// While a session acquires, its DATA change: the page follows them
const ACQUIRING_REFRESH_MS = 30000;

function formatDate(value: string | null | undefined): string {
    if (!value) return "";
    const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const KIND_WORDS: Record<RetentionKind, string> = { raw: "Raw data", processed: "Processed data" };
const RETENTION_COLORS = { due: "#b45309", expired: "#dc2626" } as const;

function left(days: number | null): string {
    if (days == null) return "";
    if (days <= 0) return days === 0 ? " (last day)" : "";
    return ` (${days} day${days === 1 ? "" : "s"} left)`;
}

/** One kind of a session's data: until when it is kept, or that it was deleted. */
function retentionLine(kind: RetentionKind, state: NonNullable<UserSession["retention"]>[RetentionKind]): string | null {
    const what = KIND_WORDS[kind];
    if (state.state === "deleted") return `${what} deleted${state.deletedAt ? ` on ${formatDate(state.deletedAt)}` : ""}.`;
    if (state.state === "expired") return `${what} were kept until ${formatDate(state.until)}: they may be deleted any day now.`;
    if ((state.state === "kept" || state.state === "due") && state.until) return `${what} kept until ${formatDate(state.until)}${left(state.daysLeft)}.`;
    return null;
}

/** How long the facility keeps a session's data: until a date once it finished, else how long after it does. */
function Retention({ session, mine, colors }: { session: UserSession; mine: MyFacility; colors: PanelStyles["colors"] }) {
    const lines = (["raw", "processed"] as RetentionKind[]).flatMap((kind) => {
        const state = session.retention?.[kind];
        const line = state ? retentionLine(kind, state) : null;
        return line ? [{ kind, line, color: RETENTION_COLORS[state!.state as keyof typeof RETENTION_COLORS] }] : [];
    });
    if (!lines.length && session.status !== "finished" && session.status !== "archived") {
        const parts: string[] = [];
        if (mine.rawRetentionDays) parts.push(`raw data kept ${mine.rawRetentionDays} days after the session finishes`);
        if (mine.processedRetentionDays) parts.push(`processed data ${mine.processedRetentionDays} days`);
        if (!parts.length) return null;
        const first = parts.join(", ");
        return (
            <Kept colors={colors}>
                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                    {first.charAt(0).toUpperCase() + first.slice(1)}.
                </Typography>
            </Kept>
        );
    }
    if (!lines.length) return null;
    return (
        <Kept colors={colors}>
            {lines.map(({ kind, line, color }) => (
                <Typography key={kind} data-testid={`retention-${kind}`}
                            sx={{ fontSize: FACILITY_TEXT.itemLine, color: color ?? colors.muted, fontWeight: color ? 700 : 400 }}>
                    {line}
                </Typography>
            ))}
        </Kept>
    );
}

/** How long the data are kept, beside its icon. */
function Kept({ colors, children }: { colors: PanelStyles["colors"]; children: React.ReactNode }) {
    return (
        <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ color: colors.muted }}>
            <Box sx={{ pt: 0.35, display: "flex" }}><Archive size={15} /></Box>
            <Box sx={{ minWidth: 0 }}>{children}</Box>
        </Stack>
    );
}

function SessionCard({ session, mine, colors, card }: {
    session: UserSession;
    mine: MyFacility;
    colors: PanelStyles["colors"];
    card: string;
}) {
    const data = session.datasets.filter((dataset) => dataset.kind === "data");
    const facts: SessionFact[] = [
        { icon: <MicroscopeIcon size={15} />, text: session.microscopeName ?? "" },
        { icon: <Layers size={15} />, text: TECHNIQUE_LABELS[session.technique] },
        { icon: <CalendarDays size={15} />, text: formatDate(session.scheduledOn) },
        // A PI sees whose session of the group it is
        { icon: <UserRound size={15} />, text: session.asPi ? session.userName || session.userEmail || "" : "" },
        { icon: <UsersRound size={15} />, text: session.groupName ? `group ${session.groupName}` : "" },
        { icon: <Ticket size={15} />, text: session.bookingRef ? `booking ${session.bookingRef}` : "" },
    ];
    return (
        <Box sx={sessionCardSx(session.status, colors, card)} data-testid={`my-session-${session.id}`}>
            <Stack spacing={0.85} sx={{ px: 2, pt: 1.5, pb: 1.25 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle + 0.5, fontWeight: 800, fontFamily: "monospace", color: colors.text,
                                      wordBreak: "break-all" }}>
                        {session.name}
                    </Typography>
                    <SessionStatusPill status={session.status} />
                </Stack>
                <SessionFacts facts={facts} colors={colors} />
                <Retention session={session} mine={mine} colors={colors} />
                {session.userNotes && (
                    <Box sx={{ bgcolor: colors.hover, borderRadius: 2, px: 1.5, py: 1 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: colors.muted, mb: 0.25 }}>
                            <MessageSquare size={15} />
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 700, color: colors.muted }}>From the facility</Typography>
                        </Stack>
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, whiteSpace: "pre-wrap" }}>
                            {session.userNotes}
                        </Typography>
                    </Box>
                )}
            </Stack>
            {data.length > 0 && (
                <Box sx={{ borderTop: `1px solid ${colors.border}`, bgcolor: colors.hover, px: 2, py: 1 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 800, color: colors.muted, textTransform: "uppercase",
                                      letterSpacing: 0.5, mb: 0.5 }}>
                        Your data
                    </Typography>
                    <Stack spacing={0.75}>
                        {data.map((dataset) => (
                            <Box key={dataset.id} sx={{ minWidth: 0 }}>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontFamily: "monospace", fontSize: FACILITY_TEXT.itemLine, color: colors.text, flexShrink: 0 }}>
                                        {dataset.folder}
                                    </Typography>
                                    <Typography noWrap sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted, minWidth: 0 }}>
                                        {describeDatasetGrid(dataset) || "no grid given"}
                                        {dataset.detectorName ? ` · ${dataset.detectorName}` : ""}
                                    </Typography>
                                    {dataset.projectId != null && (
                                        <Box sx={{ ml: "auto !important", flexShrink: 0 }}>
                                            <DatasetProjectLinks dataset={dataset} colors={colors} readOnly />
                                        </Box>
                                    )}
                                </Stack>
                                <Box sx={{ pl: 1 }}>
                                    <DatasetProgress dataset={dataset as unknown as SessionDataset} colors={colors} />
                                    {dataset.navigation?.state === "done" && <NavigationReport dataset={dataset} canMake={false} />}
                                </Box>
                            </Box>
                        ))}
                    </Stack>
                </Box>
            )}
        </Box>
    );
}

/** What a user sees of the facility: their sessions (and their group's, for its PI) and samples, read only. */
export default function MySessionsPanel({ colors, actionButtonSx }: PanelStyles) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const isDark = useIsDark();
    const sectionColors = { ...useFacilityStyles().colors, ...colors };
    const [mine, setMine] = useState<MyFacility | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (quiet = false) => {
        if (!quiet) setLoading(true);
        try {
            setMine(await getMyFacility());
            setError(null);
        } catch (e) {
            setError(String((e as { message?: string } | null)?.message || "Failed to load your sessions"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const acquiring = mine?.sessions.some((session) => session.status === "acquiring") ?? false;
    useEffect(() => {
        if (!acquiring) return;
        const timer = window.setInterval(() => void load(true), ACQUIRING_REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [acquiring, load]);

    if (error) return <Alert severity="error">{error}</Alert>;
    if (loading && !mine) return <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>;
    if (!mine) return null;

    return (
        <Stack spacing={2}>
            <SettingsSection
                plain
                icon={<UserRound size={19} />}
                title="My sessions"
                subtitle={mine.isPi
                    ? "Your acquisition sessions and those of the groups you lead, as the facility processes them. Read only: the facility's processing runs as it is."
                    : "Your acquisition sessions, as the facility processes them. Read only: the facility's processing runs as it is."}
                colors={sectionColors}
                isDarkMode={isDark}
                actions={
                    <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                            disabled={loading} onClick={() => void load()}>
                        Reload
                    </Button>
                }
            >
                <Stack spacing={1.5}>
                    {mine.sessions.length === 0 && (
                        <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 3, textAlign: "center" }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                                You have no sessions at the facility yet.
                            </Typography>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.5 }}>
                                When the facility plans one for you, it shows here with its data and how it is processed.
                            </Typography>
                        </Box>
                    )}
                    {mine.sessions.map((session) => (
                        <SessionCard key={session.id} session={session} mine={mine} colors={colors} card={sectionColors.card} />
                    ))}
                </Stack>
            </SettingsSection>

            {mine.downloadInstructions && (
                <SettingsSection plain icon={<Download size={19} />} title="Taking your data home" colors={sectionColors}
                                 isDarkMode={isDark}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, whiteSpace: "pre-wrap" }}>
                        {mine.downloadInstructions}
                    </Typography>
                </SettingsSection>
            )}

            {mine.samples.length > 0 && (
                <SettingsSection plain icon={<FlaskConical size={19} />} colors={sectionColors} isDarkMode={isDark}
                                 title={mine.isPi ? "Samples of you and your groups" : "My samples"}>
                    <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, overflow: "hidden" }}>
                        {mine.samples.map((sample, index) => {
                            const grids = sample.boxes.reduce((count, box) => count + box.grids.length, 0);
                            return (
                                <Stack key={sample.id} direction="row" spacing={1.5} alignItems="center"
                                       sx={{ px: 2, py: 1, borderTop: index > 0 ? `1px solid ${colors.border}` : "none" }}>
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine + 0.5, fontWeight: 700, color: colors.text }}>
                                            {sample.code}
                                        </Typography>
                                        {(sample.description || (mine.isPi && (sample.ownerName || sample.ownerEmail))) && (
                                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                                {[sample.description, mine.isPi && (sample.ownerName || sample.ownerEmail)]
                                                    .filter(Boolean).join(" · ")}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Box component="span" sx={{ px: 1, borderRadius: 10, flexShrink: 0, lineHeight: 1.7,
                                                                fontSize: FACILITY_TEXT.badge, fontWeight: 600, color: colors.muted,
                                                                bgcolor: colors.hover, whiteSpace: "nowrap" }}>
                                        {`${sample.boxes.length} box${sample.boxes.length === 1 ? "" : "es"} · ${grids} grid${grids === 1 ? "" : "s"}`}
                                    </Box>
                                </Stack>
                            );
                        })}
                    </Box>
                </SettingsSection>
            )}
        </Stack>
    );
}
