import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CardHeader, CircularProgress, Stack, Typography } from "@mui/material";
import { RefreshCw } from "lucide-react";

import { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import { getMyFacility, type MyFacility, type RetentionKind, type SessionDataset, type UserSession } from "@/api/facility";
import { FACILITY_TEXT } from "./facilityStyles";
import { DatasetProgress, DatasetProjectLinks, describeDatasetGrid, SESSION_STATUS_LABELS } from "./SessionsPanel";
import NavigationReport from "./NavigationReport";

type PanelStyles = {
    cardSx: any;
    cardHeaderSx: any;
    actionButtonSx?: any;
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
            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                {first.charAt(0).toUpperCase() + first.slice(1)}.
            </Typography>
        );
    }
    return (
        <>
            {lines.map(({ kind, line, color }) => (
                <Typography key={kind} data-testid={`retention-${kind}`}
                            sx={{ fontSize: FACILITY_TEXT.itemLine, color: color ?? colors.muted, fontWeight: color ? 700 : 400 }}>
                    {line}
                </Typography>
            ))}
        </>
    );
}

function SessionCard({ session, mine, colors }: { session: UserSession; mine: MyFacility; colors: PanelStyles["colors"] }) {
    return (
        <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.5 }}>
            <Stack spacing={0.5}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 800, fontFamily: "monospace", color: colors.text,
                                      wordBreak: "break-all" }}>
                        {session.name}
                    </Typography>
                    <Typography sx={{ fontSize: FACILITY_TEXT.badge, fontWeight: 700, color: colors.muted, flexShrink: 0 }}>
                        {SESSION_STATUS_LABELS[session.status]}
                    </Typography>
                </Stack>
                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                    {[session.microscopeName, TECHNIQUE_LABELS[session.technique], formatDate(session.scheduledOn),
                      session.asPi && (session.userName || session.userEmail), session.groupName && `group ${session.groupName}`,
                      session.bookingRef && `booking ${session.bookingRef}`].filter(Boolean).join(" · ")}
                </Typography>
                <Retention session={session} mine={mine} colors={colors} />
                {session.userNotes && (
                    <Box sx={{ borderLeft: `3px solid ${colors.border}`, pl: 1.25, py: 0.25 }}>
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 700, color: colors.muted }}>From the facility</Typography>
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, whiteSpace: "pre-wrap" }}>
                            {session.userNotes}
                        </Typography>
                    </Box>
                )}
                <Stack spacing={0.75} sx={{ pt: 0.5 }}>
                    {session.datasets.filter((dataset) => dataset.kind === "data").map((dataset) => (
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
            </Stack>
        </Box>
    );
}

/** What a user sees of the facility: their sessions (and their group's, for its PI) and samples, read only. */
export default function MySessionsPanel({ cardSx, cardHeaderSx, colors, actionButtonSx }: PanelStyles) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const [mine, setMine] = useState<MyFacility | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (quiet = false) => {
        if (!quiet) setLoading(true);
        try {
            setMine(await getMyFacility());
            setError(null);
        } catch (e: any) {
            setError(String(e?.message || "Failed to load your sessions"));
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
        <Stack spacing={1.75}>
            <Card variant="outlined" sx={cardSx}>
                <CardHeader
                    title="My sessions"
                    subheader={mine.isPi
                        ? "Your acquisition sessions and those of the groups you lead, as the facility processes them. They are read only: the facility's processing runs as it is."
                        : "Your acquisition sessions, as the facility processes them. They are read only: the facility's processing runs as it is."}
                    sx={cardHeaderSx}
                    action={
                        <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                disabled={loading} onClick={() => void load()}>
                            Reload
                        </Button>
                    }
                />
                <CardContent sx={{ pt: 2 }}>
                    <Stack spacing={1.25}>
                        {mine.sessions.length === 0 && <Alert severity="info">You have no sessions at the facility yet.</Alert>}
                        {mine.sessions.map((session) => <SessionCard key={session.id} session={session} mine={mine} colors={colors} />)}
                    </Stack>
                </CardContent>
            </Card>

            {mine.downloadInstructions && (
                <Card variant="outlined" sx={cardSx}>
                    <CardHeader title="Taking your data home" sx={cardHeaderSx} />
                    <CardContent sx={{ pt: 1.5 }}>
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, whiteSpace: "pre-wrap" }}>
                            {mine.downloadInstructions}
                        </Typography>
                    </CardContent>
                </Card>
            )}

            {mine.samples.length > 0 && (
                <Card variant="outlined" sx={cardSx}>
                    <CardHeader title={mine.isPi ? "Samples of you and your groups" : "My samples"} sx={cardHeaderSx} />
                    <CardContent sx={{ pt: 1.5 }}>
                        <Stack spacing={0.75}>
                            {mine.samples.map((sample) => {
                                const grids = sample.boxes.reduce((count, box) => count + box.grids.length, 0);
                                return (
                                    <Typography key={sample.id} sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text }}>
                                        <strong>{sample.code}</strong>
                                        <Box component="span" sx={{ color: colors.muted }}>
                                            {[sample.description, `${sample.boxes.length} box${sample.boxes.length === 1 ? "" : "es"}, ${grids} grid${grids === 1 ? "" : "s"}`,
                                              mine.isPi && (sample.ownerName || sample.ownerEmail)].filter(Boolean).map((part) => ` · ${part}`).join("")}
                                        </Box>
                                    </Typography>
                                );
                            })}
                        </Stack>
                    </CardContent>
                </Card>
            )}
        </Stack>
    );
}
