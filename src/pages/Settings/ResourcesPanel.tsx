import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
    Alert, Box, Button, Chip, CircularProgress, LinearProgress, Paper, Stack, Typography,
} from "@mui/material";
import { Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react";

import PageMeta from "@/components/common/PageMeta";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { formatBytes } from "@/components/projects/ProjectOverviewPanel";
import { getResources, type GpuUse, type Machine, type MachineGpu, type ResourceRun, type Resources } from "@/api/resources";
import { formatHours } from "@/api/usage";
import { useFacilityStyles, FACILITY_TEXT } from "@/pages/Facility/facilityStyles";

const REFRESH_MS = 10_000;
const wrapperMaxWidth = 1180;

type Colors = ReturnType<typeof useFacilityStyles>["colors"];

function percent(part: number | null | undefined, whole: number | null | undefined): number | null {
    return part != null && whole ? Math.max(0, Math.min(100, (part / whole) * 100)) : null;
}

function barColor(value: number | null): "primary" | "warning" | "error" {
    if (value == null) return "primary";
    return value >= 90 ? "error" : value >= 75 ? "warning" : "primary";
}

/** How long ago, for a run or a wait. */
export function since(iso: string | null | undefined, now: number = Date.now()): string {
    if (!iso) return "";
    const hours = Math.max(0, now - new Date(iso).getTime()) / 3_600_000;
    return `for ${formatHours(hours)}`;
}

/** What a run is, as the user may see it. */
export function runTitle(run: ResourceRun): string {
    if (run.protocolClassName === undefined && !run.mine) return "Another user";
    const what = run.protocolLabel || run.protocolClassName || "A protocol";
    const where = run.projectName ? ` in ${run.projectName}` : "";
    return run.mine ? `Your ${what}${where}` : `${run.userName ?? "A user"}: ${what}${where}`;
}

function useLine(use: GpuUse, seeAll: boolean): string {
    if (use.kind === "other") {
        return `A program outside the projects${seeAll && use.pid ? ` (process ${use.pid})` : ""}`;
    }
    const title = runTitle(use.run);
    return use.kind === "reserved" ? `${title} · given, not used now` : title;
}

function Meter({ label, value, text, colors }: { label: string; value: number | null; text: string; colors: Colors }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>{label}</Typography>
                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.text, whiteSpace: "nowrap" }}>{text}</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={value ?? 0} color={barColor(value)}
                            sx={{ height: 6, borderRadius: 3, mt: 0.4 }} />
        </Box>
    );
}

const STATE_LABEL = { free: "Free", busy: "In use", reserved: "Given, idle" } as const;
const STATE_COLOR = { free: "success", busy: "primary", reserved: "warning" } as const;

function GpuCard({ gpu, seeAll, colors }: { gpu: MachineGpu; seeAll: boolean; colors: Colors }) {
    const memory = percent(gpu.memoryUsedBytes, gpu.memoryTotalBytes);
    return (
        <Box data-testid={`gpu-${gpu.index}`}
             sx={{ p: 1.5, border: `1px solid ${colors.border}`, borderRadius: 2, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                    GPU {gpu.index}
                </Typography>
                <Typography noWrap sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, flex: 1, minWidth: 0 }}>
                    {gpu.name ?? ""}
                </Typography>
                <Chip size="small" variant="outlined" color={STATE_COLOR[gpu.state]} label={STATE_LABEL[gpu.state]}
                      sx={{ fontSize: FACILITY_TEXT.badge }} />
            </Stack>
            <Stack spacing={0.9}>
                <Meter label="Busy" value={gpu.busy} text={gpu.busy != null ? `${Math.round(gpu.busy)} %` : "—"}
                       colors={colors} />
                <Meter label="Memory" value={memory} colors={colors}
                       text={`${formatBytes(gpu.memoryUsedBytes)} of ${formatBytes(gpu.memoryTotalBytes)}`} />
                {gpu.temperature != null && (
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                        {Math.round(gpu.temperature)} °C
                    </Typography>
                )}
                {gpu.uses.map((use, position) => (
                    <Typography key={position} sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text }}>
                        {useLine(use, seeAll)}
                        {use.kind !== "reserved" && use.memoryBytes > 0 && (
                            <Box component="span" sx={{ color: colors.muted }}> · {formatBytes(use.memoryBytes)}</Box>
                        )}
                    </Typography>
                ))}
            </Stack>
        </Box>
    );
}

function MachineCard({ machine, seeAll, colors }: { machine: Machine; seeAll: boolean; colors: Colors }) {
    const load = percent(machine.load1, machine.cpuCount);
    const memoryUsed = machine.memoryTotalBytes != null && machine.memoryAvailableBytes != null
        ? machine.memoryTotalBytes - machine.memoryAvailableBytes : null;
    return (
        <Paper variant="outlined" data-testid={`machine-${machine.hostname}`}
               sx={{ p: 2, borderRadius: 2, bgcolor: "transparent", borderColor: colors.border, color: colors.text }}>
            <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 1.5 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 800 }}>{machine.hostname}</Typography>
                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                    {machine.runs} {machine.runs === 1 ? "run" : "runs"} now
                </Typography>
            </Stack>
            {machine.error ? (
                <Alert severity="warning">This machine could not tell what it has in use.</Alert>
            ) : (
                <Stack spacing={1.75}>
                    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" } }}>
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                            <Cpu size={18} style={{ marginTop: 2, flexShrink: 0 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Meter label={`Processors (${machine.cpuCount ?? "?"})`} value={load} colors={colors}
                                       text={load != null ? `${Math.round(load)} % busy` : "—"} />
                            </Box>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                            <MemoryStick size={18} style={{ marginTop: 2, flexShrink: 0 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Meter label="Memory" value={percent(memoryUsed, machine.memoryTotalBytes)} colors={colors}
                                       text={`${formatBytes(memoryUsed)} of ${formatBytes(machine.memoryTotalBytes)}`} />
                            </Box>
                        </Stack>
                        {machine.disks.map((disk) => (
                            <Stack key={disk.label} direction="row" spacing={1} alignItems="flex-start">
                                <HardDrive size={18} style={{ marginTop: 2, flexShrink: 0 }} />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Meter label={disk.label === "scratch" ? "Scratch disk" : "Projects disk"}
                                           value={percent(disk.totalBytes - disk.freeBytes, disk.totalBytes)}
                                           text={`${formatBytes(disk.freeBytes)} free`} colors={colors} />
                                </Box>
                            </Stack>
                        ))}
                    </Box>
                    {machine.gpuError && <Alert severity="warning">The GPUs of this machine could not be read.</Alert>}
                    {machine.gpus.length > 0 && (
                        <Box sx={{ display: "grid", gap: 1.5,
                                   gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" } }}>
                            {machine.gpus.map((gpu) => (
                                <GpuCard key={gpu.index} gpu={gpu} seeAll={seeAll} colors={colors} />
                            ))}
                        </Box>
                    )}
                    {!machine.gpuError && machine.gpus.length === 0 && (
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>No GPUs.</Typography>
                    )}
                </Stack>
            )}
        </Paper>
    );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: Colors }) {
    return (
        <Stack spacing={1}>
            <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle + 1, fontWeight: 800, color: colors.text }}>{title}</Typography>
            {children}
        </Stack>
    );
}

/** What the machines have in use right now, what runs and what waits: for everyone, each seeing their own. */
export default function ResourcesPage() {
    const { colors, actionButtonSx } = useFacilityStyles();
    const [data, setData] = useState<Resources | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const busy = useRef(false);

    const load = useCallback(async () => {
        if (busy.current) return;
        busy.current = true;
        setLoading(true);
        try {
            setData(await getResources());
            setError(null);
            setUpdatedAt(new Date());
        } catch (e: any) {
            setError(String(e?.message || "Failed to load the resources"));
        } finally {
            busy.current = false;
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") void load();
        }, REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [load]);

    const mine = (data?.runs ?? []).filter((run) => run.mine || data?.seeAll);
    const others = (data?.runs ?? []).length - mine.length;
    const lineSx = { fontSize: FACILITY_TEXT.itemLine, color: colors.text };
    const noteSx = { fontSize: FACILITY_TEXT.note, color: colors.muted };

    return (
        <>
            <PageMeta title="Scipion | Resources" description="What the machines have in use right now" />
            <PageBreadcrumb pageTitle="Resources" />
            <div className="rounded-2xl border p-5 lg:p-6"
                 style={{ maxWidth: wrapperMaxWidth, width: "100%", background: colors.surface,
                          borderColor: colors.border, color: colors.text }}>
                <Stack spacing={2.5}>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Typography sx={{ ...noteSx, flex: 1 }}>
                            {updatedAt ? `Updated at ${updatedAt.toLocaleTimeString()}` : ""}
                        </Typography>
                        <Button size="small" variant="outlined" sx={actionButtonSx} disabled={loading}
                                startIcon={<RefreshCw size={15} />} onClick={() => void load()}>
                            Reload
                        </Button>
                    </Stack>

                    {error && <Alert severity="error">{error}</Alert>}
                    {!data && !error && (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={28} /></Box>
                    )}

                    {data && (
                        <>
                            <Section title="Machines" colors={colors}>
                                {data.machines.length === 0 ? (
                                    <Alert severity="info">
                                        No machine answered: the workers that run the protocols may be stopped.
                                    </Alert>
                                ) : (
                                    <Stack spacing={2}>
                                        {data.machines.map((machine) => (
                                            <MachineCard key={machine.hostname} machine={machine} seeAll={data.seeAll}
                                                         colors={colors} />
                                        ))}
                                    </Stack>
                                )}
                            </Section>

                            <Section title={data.seeAll ? "Running now" : "Your runs now"} colors={colors}>
                                {mine.length === 0 && (
                                    <Typography sx={noteSx}>{data.seeAll ? "Nothing runs now." : "None of yours runs now."}</Typography>
                                )}
                                {mine.map((run) => (
                                    <Box key={run.id} data-testid={`run-${run.id}`}>
                                        <Typography sx={lineSx}>
                                            {run.projectId != null ? (
                                                <Link to={`/project/load/${run.projectId}`} style={{ color: "inherit" }}>
                                                    {runTitle(run)}
                                                </Link>
                                            ) : runTitle(run)}
                                        </Typography>
                                        <Typography sx={noteSx}>
                                            {[run.host, run.gpus ? `${run.gpus} GPU${run.gpus === 1 ? "" : "s"}` : null,
                                              run.queued ? `through the queue${run.queueName ? ` ${run.queueName}` : ""}` : null,
                                              run.streaming ? "in streaming" : null, since(run.startedAt)]
                                                .filter(Boolean).join(" · ")}
                                        </Typography>
                                    </Box>
                                ))}
                                {others > 0 && (
                                    <Typography sx={noteSx}>
                                        And {others} {others === 1 ? "run" : "runs"} of other users.
                                    </Typography>
                                )}
                            </Section>

                            <Section title={data.seeAll ? "Waiting" : "Yours waiting"} colors={colors}>
                                {data.waiting.length === 0 && <Typography sx={noteSx}>Nothing waits.</Typography>}
                                {data.waiting.map((row) => (
                                    <Box key={`${row.projectId}-${row.protocolId}`}
                                         data-testid={`waiting-${row.projectId}-${row.protocolId}`}>
                                        <Typography sx={lineSx}>
                                            {data.seeAll && !row.mine ? `${row.userName}: ` : ""}
                                            {row.protocolClassName ?? "A protocol"}
                                            {row.projectName ? ` in ${row.projectName}` : ""}
                                        </Typography>
                                        <Typography sx={noteSx}>{[row.reason, since(row.since)].filter(Boolean).join(" · ")}</Typography>
                                    </Box>
                                ))}
                            </Section>
                        </>
                    )}
                </Stack>
            </div>
        </>
    );
}
