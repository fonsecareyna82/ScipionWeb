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
    MenuItem,
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
    type SxProps,
    type Theme,
} from "@mui/material";
import { Download, RefreshCw, X } from "lucide-react";

import {
    formatHours,
    getComputeUsage,
    getUserRuns,
    type ComputeReport,
    type ComputeRun,
    type ComputeTotals,
    type UserRuns,
} from "@/api/usage";
import { ROUNDED_BUTTON_SX } from "./SettingsDialog";

type PanelStyles = {
    fieldSx: SxProps<Theme>;
    cardSx: SxProps<Theme>;
    cardHeaderSx: SxProps<Theme>;
    actionButtonSx?: SxProps<Theme>;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};

type View = "users" | "groups" | "protocols" | "machines";
export type PeriodKey = "week" | "month" | "lastMonth" | "days30" | "year" | "custom";

const PERIODS: { key: PeriodKey; label: string }[] = [
    { key: "week", label: "This week" },
    { key: "month", label: "This month" },
    { key: "lastMonth", label: "Last month" },
    { key: "days30", label: "Last 30 days" },
    { key: "year", label: "This year" },
    { key: "custom", label: "Custom range" },
];

// The period a preset means, in the browser's time; custom takes the two days given (both included)
export function periodOf(key: PeriodKey, now: Date = new Date(), from = "", to = ""): { since: Date; until: Date } {
    const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = startOfDay(now);
    switch (key) {
        case "week": {
            // Weeks start on Monday
            const since = new Date(today);
            since.setDate(today.getDate() - ((today.getDay() + 6) % 7));
            return { since, until: now };
        }
        case "lastMonth":
            return { since: new Date(now.getFullYear(), now.getMonth() - 1, 1),
                until: new Date(now.getFullYear(), now.getMonth(), 1) };
        case "days30":
            return { since: new Date(now.getTime() - 30 * 86400000), until: now };
        case "year":
            return { since: new Date(now.getFullYear(), 0, 1), until: now };
        case "custom": {
            const since = from ? new Date(`${from}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
            const until = to ? new Date(`${to}T00:00:00`) : today;
            until.setDate(until.getDate() + 1);
            return { since, until: until > now ? now : until };
        }
        case "month":
        default:
            return { since: new Date(now.getFullYear(), now.getMonth(), 1), until: now };
    }
}

function share(part: number, whole: number): string {
    if (!whole) return "—";
    const percent = (100 * part) / whole;
    return percent > 0 && percent < 1 ? "<1 %" : `${Math.round(percent)} %`;
}

function formatWhen(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

// A row of the CSV, quoted where needed
function csvLine(values: (string | number | null | undefined)[]): string {
    return values.map((value) => {
        const text = value == null ? "" : String(value);
        return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",");
}

function download(name: string, lines: string[]) {
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

const STATUS_COLORS: Record<string, "success" | "error" | "warning" | "info" | "default"> = {
    finished: "success",
    failed: "error",
    aborted: "warning",
    interrupted: "warning",
    running: "info",
};

type Row = ComputeTotals & { key: string; name: string; note?: string | null; detail?: string | null;
    userId?: number | null };

export default function ComputeUsagePanel({ fieldSx, cardSx, cardHeaderSx, actionButtonSx, colors }: PanelStyles) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [report, setReport] = useState<ComputeReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<View>("users");
    const [text, setText] = useState("");
    // Clicking a user shows their runs
    const [runsOf, setRunsOf] = useState<{ userId: number; name: string } | null>(null);
    const [userRuns, setUserRuns] = useState<UserRuns | null>(null);

    // The period of the report shown (the one asked for, until it arrives)
    const period = report ? { since: new Date(report.since), until: new Date(report.until) }
        : periodOf(periodKey, new Date(), from, to);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setReport(await getComputeUsage(periodOf(periodKey, new Date(), from, to)));
            setError(null);
        } catch (e: unknown) {
            setError(e instanceof Error && e.message ? e.message : "Failed to load the computing used");
        } finally {
            setLoading(false);
        }
    }, [periodKey, from, to]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!runsOf) {
            setUserRuns(null);
            return;
        }
        let cancelled = false;
        setUserRuns(null);
        getUserRuns(runsOf.userId, periodOf(periodKey, new Date(), from, to))
            .then((result) => { if (!cancelled) setUserRuns(result); })
            .catch((e: unknown) => {
                if (!cancelled) setError(e instanceof Error && e.message ? e.message : "Failed to load the runs");
            });
        return () => { cancelled = true; };
    }, [runsOf, periodKey, from, to]);

    const query = text.trim().toLowerCase();
    const rows: Row[] = useMemo(() => {
        if (!report) return [];
        const all: Row[] = view === "users"
            ? report.users.map((user) => ({ ...user, key: `u${user.userId}`, note: user.email !== user.name
                    ? user.email : null, detail: user.mostUsed }))
            : view === "groups"
                ? report.groups.map((group) => ({ ...group, key: `g${group.groupId}`,
                    note: `${group.activeMembers} of ${group.members} members ran something`,
                    detail: group.mostUsed }))
                : view === "protocols"
                    ? report.protocols.map((protocol) => ({ ...protocol, key: `p${protocol.name}`,
                        note: `${protocol.users} ${protocol.users === 1 ? "user" : "users"}`, detail: null }))
                    : report.machines.map((machine) => ({ ...machine, key: `m${machine.host}`,
                        note: `${machine.users} ${machine.users === 1 ? "user" : "users"}`,
                        detail: Object.entries(machine.gpuHoursById)
                            .map(([gpu, hours]) => `GPU ${gpu}: ${formatHours(hours)}`).join(" · ") || null }));
        return all.filter((row) => !query || [row.name, row.note, row.detail]
            .some((value) => (value ?? "").toLowerCase().includes(query)));
    }, [report, view, query]);

    const total = report?.total;
    const cellSx = { fontSize: 14, color: colors.text, borderColor: colors.border, verticalAlign: "top" };
    const headSx = { ...cellSx, fontWeight: 800, color: colors.muted, whiteSpace: "nowrap" };
    const numberSx = { ...cellSx, textAlign: "right" as const, whiteSpace: "nowrap" };
    const noteSx = { fontSize: 13.5, color: colors.muted };
    const firstColumn = { users: "User", groups: "Group", protocols: "Protocol", machines: "Machine" }[view];
    const detailColumn = { users: "Uses most", groups: "Uses most", protocols: "", machines: "GPU hours by GPU" }[view];

    const exportCsv = () => {
        const day = (date: Date) => date.toISOString().slice(0, 10);
        if (runsOf && userRuns) {
            download(`runs-${runsOf.name.replace(/\W+/g, "_")}-${day(period.since)}.csv`, [
                csvLine(["Project", "Protocol", "Label", "Started", "Ended", "Hours", "GPUs", "GPU ids", "GPU hours",
                    "Machine", "Queue", "Queue job", "Status", "Streaming"]),
                ...userRuns.runs.map((run) => csvLine([run.projectName, run.protocolClassName, run.protocolLabel,
                    run.startedAt, run.endedAt, run.hours.toFixed(3), run.gpus, run.gpuIds.join(" "),
                    run.gpuHours.toFixed(3), run.host, run.queueName, run.queueJobId, run.status,
                    run.streaming ? "yes" : "no"])),
            ]);
            return;
        }
        download(`compute-${view}-${day(period.since)}-${day(period.until)}.csv`, [
            csvLine([firstColumn, "GPU hours", "Hours", "Runs", "Failed", detailColumn || "Note"]),
            ...rows.map((row) => csvLine([row.name, row.gpuHours.toFixed(3), row.hours.toFixed(3), row.runs,
                row.failed, row.detail ?? row.note])),
        ]);
    };

    const showRunsOf = (row: Row) => {
        if (view !== "users" || row.userId == null) return;
        setRunsOf({ userId: row.userId, name: row.name });
    };

    const card = (label: string, value: string, note?: string) => (
        <Box sx={{ flex: 1, p: 1.75, border: `1px solid ${colors.border}`, borderRadius: 2 }}>
            <Typography sx={noteSx}>{label}</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: colors.text }}>{value}</Typography>
            {note && <Typography sx={noteSx}>{note}</Typography>}
        </Box>
    );

    const runsTable = (runs: ComputeRun[], label: string, showUser: boolean) => (
        <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 2 }}>
            <Table size="small" aria-label={label}>
                <TableHead>
                    <TableRow>
                        {showUser && <TableCell sx={headSx}>User</TableCell>}
                        <TableCell sx={headSx}>Protocol</TableCell>
                        <TableCell sx={headSx}>Project</TableCell>
                        <TableCell sx={headSx}>Started</TableCell>
                        <TableCell sx={{ ...headSx, textAlign: "right" }}>Hours</TableCell>
                        <TableCell sx={{ ...headSx, textAlign: "right" }}>GPU hours</TableCell>
                        <TableCell sx={headSx}>Machine</TableCell>
                        <TableCell sx={headSx}>Status</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {runs.map((run) => (
                        <TableRow key={run.id}>
                            {showUser && <TableCell sx={cellSx}>{run.userName}</TableCell>}
                            <TableCell sx={cellSx}>
                                {run.protocolLabel || run.protocolClassName}
                                {run.protocolLabel && run.protocolClassName && (
                                    <Typography sx={noteSx}>{run.protocolClassName}</Typography>
                                )}
                            </TableCell>
                            <TableCell sx={cellSx}>{run.projectName ?? "—"}</TableCell>
                            <TableCell sx={cellSx}>
                                {formatWhen(run.startedAt)}
                                {run.streaming && <Typography sx={noteSx}>In streaming</Typography>}
                            </TableCell>
                            <TableCell sx={numberSx}>{formatHours(run.hours)}</TableCell>
                            <TableCell sx={{ ...numberSx, fontWeight: 700 }}>
                                {run.gpus ? formatHours(run.gpuHours) : "—"}
                                {run.gpus > 0 && (
                                    <Typography sx={noteSx}>
                                        {run.gpus} GPU{run.gpus === 1 ? "" : "s"}
                                        {run.gpuIds.length && !run.queueJobId ? ` (${run.gpuIds.join(", ")})` : ""}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell sx={cellSx}>
                                {run.host ?? "—"}
                                {run.queueJobId && (
                                    <Typography sx={noteSx}>
                                        Job {run.queueJobId}{run.queueName ? ` in ${run.queueName}` : ""}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell sx={cellSx}>
                                <Chip size="small" label={run.status ?? "—"} sx={{ fontSize: 13.5 }}
                                      color={STATUS_COLORS[run.status ?? ""] ?? "default"} variant="outlined" />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );

    return (
        <Stack spacing={1.75}>
            {error && <Alert severity="error">{error}</Alert>}
            <Card variant="outlined" sx={cardSx}>
                <CardHeader
                    title="Computing"
                    subheader={"What each user, group, protocol and machine ran in the period. Hours are the "
                        + "time the runs ran; GPU hours, those hours times the GPUs each run was given."}
                    sx={cardHeaderSx}
                    action={
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" sx={actionSx} startIcon={<Download size={15} />}
                                    disabled={!report} onClick={exportCsv}>
                                Export CSV
                            </Button>
                            <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                                    disabled={loading} onClick={() => void load()}>
                                Reload
                            </Button>
                        </Stack>
                    }
                />
                <CardContent sx={{ pt: 2 }}>
                    <Stack spacing={2.25}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                            <TextField select size="small" label="Period" value={periodKey} sx={[{ minWidth: 200 },
                                ...(Array.isArray(fieldSx) ? fieldSx : [fieldSx])]}
                                       onChange={(e) => setPeriodKey(e.target.value as PeriodKey)}>
                                {PERIODS.map((option) => (
                                    <MenuItem key={option.key} value={option.key} sx={{ fontSize: 15 }}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </TextField>
                            {periodKey === "custom" && (
                                <>
                                    <TextField size="small" type="date" label="From" value={from}
                                               InputLabelProps={{ shrink: true }} sx={fieldSx}
                                               onChange={(e) => setFrom(e.target.value)} />
                                    <TextField size="small" type="date" label="To" value={to}
                                               InputLabelProps={{ shrink: true }} sx={fieldSx}
                                               onChange={(e) => setTo(e.target.value)} />
                                </>
                            )}
                            <Typography sx={noteSx}>
                                {period.since.toLocaleDateString()} – {period.until.toLocaleString()}
                            </Typography>
                        </Stack>

                        {loading && !report ? (
                            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                                <CircularProgress size={26} />
                            </Box>
                        ) : report && total ? (
                            <Stack spacing={2.25}>
                                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                                    {card("GPU hours", formatHours(total.gpuHours))}
                                    {card("Run hours", formatHours(total.hours))}
                                    {card("Runs", total.runs.toLocaleString(),
                                        `by ${total.users} ${total.users === 1 ? "user" : "users"}`
                                        + (total.running ? ` · ${total.running} running now` : ""))}
                                    {card("Failed", total.failed.toLocaleString(),
                                        total.runs ? `${share(total.failed, total.runs)} of the runs` : undefined)}
                                </Stack>

                                {runsOf ? (
                                    <Stack spacing={1}>
                                        <Box>
                                            <Chip label={`Runs of ${runsOf.name}`} onDelete={() => setRunsOf(null)}
                                                  deleteIcon={<X size={15} />} sx={{ fontSize: 14 }} />
                                        </Box>
                                        {userRuns ? (
                                            <>
                                                {runsTable(userRuns.runs, `Runs of ${runsOf.name}`, false)}
                                                {userRuns.truncated && (
                                                    <Typography sx={noteSx}>
                                                        Only the newest {userRuns.runs.length} runs are listed;
                                                        choose a shorter period to see the rest.
                                                    </Typography>
                                                )}
                                            </>
                                        ) : (
                                            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                                                <CircularProgress size={22} />
                                            </Box>
                                        )}
                                    </Stack>
                                ) : (
                                    <>
                                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}
                                               alignItems={{ sm: "center" }}>
                                            <ToggleButtonGroup exclusive size="small" value={view}
                                                               onChange={(_, value) => value && setView(value)}>
                                                <ToggleButton value="users" sx={{ fontSize: 14, px: 2 }}>By user</ToggleButton>
                                                <ToggleButton value="groups" sx={{ fontSize: 14, px: 2 }}>By group</ToggleButton>
                                                <ToggleButton value="protocols" sx={{ fontSize: 14, px: 2 }}>
                                                    By protocol
                                                </ToggleButton>
                                                <ToggleButton value="machines" sx={{ fontSize: 14, px: 2 }}>
                                                    By machine
                                                </ToggleButton>
                                            </ToggleButtonGroup>
                                            <TextField sx={[{ flex: 1 }, ...(Array.isArray(fieldSx) ? fieldSx : [fieldSx])]}
                                                       size="small" label="Search" value={text}
                                                       placeholder="A name, an email, a protocol, a machine…"
                                                       onChange={(e) => setText(e.target.value)} />
                                        </Stack>

                                        <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 2 }}>
                                            <Table size="small" aria-label={`Computing by ${view.replace(/s$/, "")}`}>
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell sx={headSx}>{firstColumn}</TableCell>
                                                        <TableCell sx={{ ...headSx, textAlign: "right" }}>GPU hours</TableCell>
                                                        <TableCell sx={{ ...headSx, textAlign: "right" }}>Share</TableCell>
                                                        <TableCell sx={{ ...headSx, textAlign: "right" }}>Run hours</TableCell>
                                                        <TableCell sx={{ ...headSx, textAlign: "right" }}>Runs</TableCell>
                                                        <TableCell sx={{ ...headSx, textAlign: "right" }}>Failed</TableCell>
                                                        {detailColumn && <TableCell sx={headSx}>{detailColumn}</TableCell>}
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {rows.length === 0 && (
                                                        <TableRow>
                                                            <TableCell sx={cellSx} colSpan={7}>
                                                                Nothing ran in this period.
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                    {rows.map((row) => {
                                                        const clickable = view === "users" && row.userId != null;
                                                        return (
                                                            <TableRow key={row.key} hover={clickable}
                                                                      sx={clickable ? { cursor: "pointer" } : undefined}
                                                                      onClick={() => showRunsOf(row)}>
                                                                <TableCell sx={cellSx}>
                                                                    {row.name}
                                                                    {row.note && <Typography sx={noteSx}>{row.note}</Typography>}
                                                                </TableCell>
                                                                <TableCell sx={{ ...numberSx, fontWeight: 700 }}>
                                                                    {formatHours(row.gpuHours)}
                                                                </TableCell>
                                                                <TableCell sx={numberSx}>
                                                                    {share(row.gpuHours, total.gpuHours)}
                                                                </TableCell>
                                                                <TableCell sx={numberSx}>{formatHours(row.hours)}</TableCell>
                                                                <TableCell sx={numberSx}>
                                                                    {row.runs}
                                                                    {row.running > 0 && (
                                                                        <Typography sx={noteSx}>{row.running} running</Typography>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell sx={numberSx}>{row.failed || "—"}</TableCell>
                                                                {detailColumn && (
                                                                    <TableCell sx={cellSx}>{row.detail ?? "—"}</TableCell>
                                                                )}
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                        {view === "groups" && (
                                            <Typography sx={noteSx}>
                                                A group adds up what its members ran. A user in two groups counts in
                                                both, so the groups may add up to more than the total.
                                            </Typography>
                                        )}
                                        {view === "machines" && (
                                            <Typography sx={noteSx}>
                                                GPU ids are listed for runs started directly on a machine; a queue
                                                numbers the GPUs inside each job, so those runs only count in the total.
                                            </Typography>
                                        )}

                                        {report.running.length > 0 && (
                                            <Stack spacing={1}>
                                                <Typography sx={{ fontSize: 15.5, fontWeight: 800, color: colors.text }}>
                                                    Running now
                                                </Typography>
                                                {runsTable(report.running, "Running now", true)}
                                            </Stack>
                                        )}
                                    </>
                                )}
                                <Typography sx={noteSx}>
                                    Counted from the runs ScipionWeb launched since this record started. A run whose
                                    worker stopped answering counts until its last sign of life.
                                </Typography>
                            </Stack>
                        ) : null}
                    </Stack>
                </CardContent>
            </Card>
        </Stack>
    );
}
