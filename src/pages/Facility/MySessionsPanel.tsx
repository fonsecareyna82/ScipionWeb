import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router";
import { Alert, Box, Button, Card, CardContent, CardHeader, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { Activity, FolderOpen, RefreshCw } from "lucide-react";

import { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import { getMyFacility, type MyFacility, type SessionDataset, type UserSession } from "@/api/facility";
import { FACILITY_TEXT } from "./facilityStyles";
import { DatasetProgress, describeDatasetGrid, SESSION_STATUS_LABELS } from "./SessionsPanel";
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

function daysLeft(value: string): string {
    const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
    if (!Number.isFinite(days)) return "";
    return days > 0 ? `${days} day${days === 1 ? "" : "s"} left` : "past";
}

/** How long the facility keeps a session's data: until a date once it finished, else how long after it does. */
function Retention({ session, mine, colors }: { session: UserSession; mine: MyFacility; colors: PanelStyles["colors"] }) {
    const parts: string[] = [];
    if (session.rawKeptUntil) parts.push(`raw data kept until ${formatDate(session.rawKeptUntil)} (${daysLeft(session.rawKeptUntil)})`);
    if (session.processedKeptUntil) parts.push(`processed data until ${formatDate(session.processedKeptUntil)} (${daysLeft(session.processedKeptUntil)})`);
    if (!parts.length && session.status !== "finished" && session.status !== "archived") {
        if (mine.rawRetentionDays) parts.push(`raw data kept ${mine.rawRetentionDays} days after the session finishes`);
        if (mine.processedRetentionDays) parts.push(`processed data ${mine.processedRetentionDays} days`);
    }
    if (!parts.length) return null;
    const first = parts.join(", ");
    return (
        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
            {first.charAt(0).toUpperCase() + first.slice(1)}.
        </Typography>
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
                                    <Stack direction="row" spacing={0.25} sx={{ ml: "auto !important", flexShrink: 0 }}>
                                        <Tooltip arrow title="Open its project (read only)">
                                            <IconButton size="small" component={RouterLink} to={`/project/load/${dataset.projectId}`}
                                                        aria-label={`Open the project of ${dataset.folder}`}>
                                                <FolderOpen size={15} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip arrow title="Its streaming monitor">
                                            <IconButton size="small" component={RouterLink} to={`/project/${dataset.projectId}/monitor`}
                                                        aria-label={`Monitor of ${dataset.folder}`}>
                                                <Activity size={15} />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
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
