import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, RefreshCw, FileText, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

import {
    fetchPlugin,
    type Plugin,
    installPlugin,
    uninstallPlugin,
    fetchPluginTaskLog,
} from "@/api/plugins";
import { AngleLeftIcon, FolderIcon, GroupIcon, HelpIcon, HomeIcon, ExecuteIcon } from "@/icons";
import { useProcessingPlugins } from "@/hooks/useProcessingPlugins";

type LocationState = { plugin?: Plugin };

type LogTaskState = {
    taskId: string;
    operation: "install" | "install-devel" | "uninstall";
    status: string;
    completed: boolean;
    pluginName?: string;
    error?: string | null;
    backend?: "celery" | "local";
};

type AnsiColor =
    | "black"
    | "red"
    | "green"
    | "yellow"
    | "blue"
    | "magenta"
    | "cyan"
    | "white"
    | "brightBlack"
    | "brightRed"
    | "brightGreen"
    | "brightYellow"
    | "brightBlue"
    | "brightMagenta"
    | "brightCyan"
    | "brightWhite";

type AnsiSegment = {
    text: string;
    bold: boolean;
    color: AnsiColor | null;
};

function classNames(...xs: Array<string | false | null | undefined>): string {
    return xs.filter(Boolean).join(" ");
}

const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

const ansiColorMap: Record<number, AnsiColor> = {
    30: "black",
    31: "red",
    32: "green",
    33: "yellow",
    34: "blue",
    35: "magenta",
    36: "cyan",
    37: "white",
    90: "brightBlack",
    91: "brightRed",
    92: "brightGreen",
    93: "brightYellow",
    94: "brightBlue",
    95: "brightMagenta",
    96: "brightCyan",
    97: "brightWhite",
};

function getAnsiColorClass(color: AnsiColor | null): string {
    switch (color) {
        case "black":
            return "text-slate-700 dark:text-slate-300";
        case "red":
            return "text-red-700 dark:text-red-300";
        case "green":
            return "text-emerald-700 dark:text-emerald-300";
        case "yellow":
            return "text-amber-700 dark:text-amber-300";
        case "blue":
            return "text-blue-700 dark:text-blue-300";
        case "magenta":
            return "text-fuchsia-700 dark:text-fuchsia-300";
        case "cyan":
            return "text-cyan-700 dark:text-cyan-300";
        case "white":
            return "text-slate-700 dark:text-slate-100";
        case "brightBlack":
            return "text-slate-500 dark:text-slate-400";
        case "brightRed":
            return "text-rose-700 dark:text-rose-300";
        case "brightGreen":
            return "text-lime-700 dark:text-lime-300";
        case "brightYellow":
            return "text-yellow-700 dark:text-yellow-300";
        case "brightBlue":
            return "text-sky-700 dark:text-sky-300";
        case "brightMagenta":
            return "text-pink-700 dark:text-pink-300";
        case "brightCyan":
            return "text-teal-700 dark:text-teal-300";
        case "brightWhite":
            return "text-slate-800 dark:text-white";
        default:
            return "text-slate-700 dark:text-slate-200";
    }
}

function stripAnsiTerminalControls(
    value: string,
): string {
    return value.replace(
        // Keep SGR sequences (...m) because parseAnsiSegments
        // uses them to render colors. Remove cursor/erase/etc.
        // eslint-disable-next-line no-control-regex
        /\x1B\[(?![0-9;]*m)[0-?]*[ -/]*[@-~]/g,
        "",
    );
}

function parseAnsiSegments(text: string): AnsiSegment[] {
    if (!text) return [];

    const regex = /\x1b\[([0-9;]*)m/g;
    const segments: AnsiSegment[] = [];

    let lastIndex = 0;
    let bold = false;
    let color: AnsiColor | null = null;

    const pushText = (chunk: string) => {
        if (!chunk) return;
        segments.push({ text: chunk, bold, color });
    };

    for (const match of text.matchAll(regex)) {
        const fullMatch = match[0];
        const params = match[1] ?? "";
        const index = match.index ?? 0;

        if (index > lastIndex) {
            pushText(text.slice(lastIndex, index));
        }

        const codes = params.length > 0 ? params.split(";").map((x) => Number.parseInt(x, 10)) : [0];

        for (let i = 0; i < codes.length; i += 1) {
            const code = codes[i];

            if (Number.isNaN(code)) continue;

            if (code === 0) {
                bold = false;
                color = null;
                continue;
            }

            if (code === 1) {
                bold = true;
                continue;
            }

            if (code === 22) {
                bold = false;
                continue;
            }

            if (code === 39) {
                color = null;
                continue;
            }

            if (code in ansiColorMap) {
                color = ansiColorMap[code];
                continue;
            }
        }

        lastIndex = index + fullMatch.length;
    }

    if (lastIndex < text.length) {
        pushText(text.slice(lastIndex));
    }

    return segments;
}

function CardShell(props: {
    title: string;
    subtitle?: string;
    right?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div
            className={classNames(
                crispText,
                "relative overflow-hidden rounded-2xl border p-5 shadow-sm",
                "border-gray-300/90 bg-white",
                "dark:border-gray-700 dark:bg-slate-900",
                "lg:p-6",
            )}
        >
            <div className="relative">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-semibold tracking-[0.01em] text-gray-950 dark:text-white">
                            {props.title}
                        </h3>
                        {props.subtitle ? (
                            <p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">{props.subtitle}</p>
                        ) : null}
                    </div>
                    {props.right ? <div className="shrink-0">{props.right}</div> : null}
                </div>
                {props.children}
            </div>
        </div>
    );
}

function InfoCard(props: {
    icon: ReactNode;
    title: string;
    children: ReactNode;
}) {
    return (
        <div
            className={classNames(
                crispText,
                "rounded-2xl border p-4 shadow-sm",
                "border-gray-300/80 bg-white",
                "dark:border-gray-700 dark:bg-slate-900",
            )}
        >
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300/80 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200">
                    {props.icon}
                </div>
                <div className="text-sm font-semibold text-gray-950 dark:text-white">{props.title}</div>
            </div>
            <div className="mt-4 text-sm leading-6 text-gray-700 dark:text-gray-300">{props.children}</div>
        </div>
    );
}

function StatPill(props: { label: string; value: ReactNode }) {
    return (
        <div
            className={classNames(
                crispText,
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
                "border-gray-300/80 bg-white text-gray-700",
                "dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200",
            )}
        >
            <span className="text-gray-600 dark:text-gray-300">{props.label}</span>
            <span className="text-gray-950 dark:text-white">{props.value}</span>
        </div>
    );
}

function PrimaryButton(props: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    title?: string;
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            disabled={props.disabled}
            title={props.title}
            className={classNames(
                "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
                "text-white shadow-sm",
                "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600",
                "hover:brightness-[0.98] hover:shadow-md",
                "disabled:cursor-not-allowed disabled:opacity-60",
                props.className,
            )}
        >
            {props.children}
        </button>
    );
}

function SecondaryButton(props: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    title?: string;
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            disabled={props.disabled}
            title={props.title}
            className={classNames(
                crispText,
                "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition",
                "border-gray-300/80 bg-white text-gray-800 shadow-sm hover:border-gray-400 hover:shadow-md",
                "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:border-gray-600",
                "disabled:cursor-not-allowed disabled:opacity-60",
                props.className,
            )}
        >
            {props.children}
        </button>
    );
}

function TaskStatusBadge(props: { status?: string }) {
    const status = String(props.status ?? "UNKNOWN").toUpperCase();

    const classes =
        status === "SUCCESS"
            ? "border-green-200/80 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200"
            : status === "FAILURE"
                ? "border-red-200/80 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
                : "border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200";

    return (
        <span className={classNames("inline-flex items-center rounded-xl border px-3 py-1 text-xs font-semibold", classes)}>
            {status}
        </span>
    );
}

function LogViewer(props: {
    logTask: LogTaskState | null;
    taskLog: string;
    taskLogError: string | null;
    autoScroll: boolean;
    expanded: boolean;
    onToggleAutoScroll: () => void;
    onClear: () => void;
    onToggleExpanded: () => void;
    logContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
    const displayLog = useMemo(
        () => stripAnsiTerminalControls(props.taskLog),
        [props.taskLog],
    );

    const parsedSegments = useMemo(
        () => parseAnsiSegments(displayLog),
        [displayLog],
    );

    const logLineCount = useMemo(() => {
        if (!displayLog) return 0;
        return displayLog.split(/\r?\n/).filter(Boolean).length;
    }, [displayLog]);

    return (
        <CardShell
            title="Task log"
            subtitle={
                props.logTask
                    ? `${props.logTask.operation === "install" ? "Install/Update" : "Uninstall"} output for ${props.logTask.pluginName ?? "plugin"}`
                    : "Live output from the current plugin operation."
            }
            right={
                <div className="flex flex-wrap items-center gap-2">
                    {props.logTask?.status ? <TaskStatusBadge status={props.logTask.status} /> : null}

                    <SecondaryButton
                        onClick={props.onToggleAutoScroll}
                        className="px-3 py-2 text-xs"
                        title="Toggle auto-scroll"
                    >
                        {props.autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
                    </SecondaryButton>

                    <SecondaryButton
                        onClick={props.onToggleExpanded}
                        className="px-3 py-2 text-xs"
                        title={props.expanded ? "Collapse log" : "Expand log"}
                    >
                        {props.expanded ? (
                            <>
                                Collapse
                                <ChevronUp className="h-4 w-4" />
                            </>
                        ) : (
                            <>
                                Expand
                                <ChevronDown className="h-4 w-4" />
                            </>
                        )}
                    </SecondaryButton>

                    <SecondaryButton
                        onClick={props.onClear}
                        className="px-3 py-2 text-xs"
                        title="Clear task log"
                    >
                        <Trash2 className="h-4 w-4" />
                        Clear
                    </SecondaryButton>
                </div>
            }
        >
            {props.logTask?.error ? (
                <div className="mb-3 rounded-xl border border-red-200/80 bg-red-50 p-3 text-sm leading-6 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                    {props.logTask.error}
                </div>
            ) : null}

            {props.taskLogError ? (
                <div className="mb-3 rounded-xl border border-red-200/80 bg-red-50 p-3 text-sm leading-6 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                    {props.taskLogError}
                </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-gray-300/80 shadow-sm dark:border-gray-700">
                <div className="flex items-center justify-between border-b border-gray-300/80 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-4 py-3 dark:border-gray-700 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-300/80 bg-white text-gray-700 shadow-sm dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200">
                            <FileText className="h-4 w-4" />
                        </div>

                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-950 dark:text-white">
                                {props.logTask?.taskId ? `Task ${props.logTask.taskId}` : "Task output"}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                                <span>{props.logTask?.completed ? "Completed output" : "Streaming output"}</span>
                                <span>{logLineCount} lines</span>
                            </div>
                        </div>
                    </div>

                    {props.logTask?.completed ? (
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Completed</span>
                    ) : (
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Live</span>
                    )}
                </div>

                <div
                    ref={props.logContainerRef}
                    className={classNames(
                        "overflow-auto px-4 py-4",
                        props.expanded ? "max-h-[560px]" : "max-h-[320px]",
                        "bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950",
                    )}
                >
                    {parsedSegments.length > 0 ? (
                        <pre
                            className={classNames(
                                crispText,
                                "font-mono text-xs leading-6 whitespace-pre-wrap break-words",
                                "text-slate-700 dark:text-slate-200",
                            )}
                        >
                            {parsedSegments.map((segment, index) => (
                                <span
                                    key={`${index}-${segment.text.length}`}
                                    className={classNames(
                                        getAnsiColorClass(segment.color),
                                        segment.bold ? "font-semibold" : "",
                                    )}
                                >
                                    {segment.text}
                                </span>
                            ))}
                        </pre>
                    ) : (
                        <div className="rounded-xl border border-dashed border-gray-300/80 bg-white/70 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:bg-slate-900/60 dark:text-gray-400">
                            Waiting for log output...
                        </div>
                    )}
                </div>
            </div>
        </CardShell>
    );
}

export default function PluginPage() {
    const { pipName } = useParams<{ pipName: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const state = (location.state as LocationState | null) ?? null;

    const [plugin, setPlugin] = useState<Plugin | null>(state?.plugin ?? null);
    const [loading, setLoading] = useState<boolean>(!state?.plugin);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [logTask, setLogTask] = useState<LogTaskState | null>(null);
    const [taskLog, setTaskLog] = useState("");
    const [taskLogError, setTaskLogError] = useState<string | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [logExpanded, setLogExpanded] = useState(false);

    const isMountedRef = useRef(true);
    const taskLogOffsetRef = useRef(0);
    const logContainerRef = useRef<HTMLDivElement | null>(null);

    const [skipBinaries, setSkipBinaries] = useState(false);

    const {
        tasks,
        installing,
        removing,
        startInstall,
        finishInstall,
        startRemove,
        finishRemove,
        registerTask,
        waitForTask,
    } = useProcessingPlugins();

    const currentTask = useMemo(
        () =>
            tasks.find((task) => {
                if (task.pipName !== pipName) return false;

                const status = String(task.status ?? "")
                    .trim()
                    .toUpperCase();

                return ![
                    "SUCCESS",
                    "FAILURE",
                    "CANCELLED",
                ].includes(status);
            }),
        [tasks, pipName],
    );

    const currentStep = currentTask?.step;

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!pipName) return;

        setError(null);
        setSuccess(null);

        if (!state?.plugin) {
            setLoading(true);
        }

        fetchPlugin(pipName)
            .then((p) => {
                if (!isMountedRef.current) return;
                setPlugin(p);
            })
            .catch((err) => {
                console.error(err);
                if (!isMountedRef.current) return;
                setError("Error loading plugin details");
            })
            .finally(() => {
                if (!isMountedRef.current) return;
                setLoading(false);
            });
    }, [pipName, state?.plugin]);

    useEffect(() => {
        if (!currentTask) return;

        setLogTask((prev) => {
            if (prev && prev.taskId === currentTask.taskId) {
                return {
                    ...prev,
                    status: String(currentTask.status ?? prev.status),
                    error: currentTask.error ?? prev.error ?? null,
                    completed: ["SUCCESS", "FAILURE", "CANCELLED"].includes(String(currentTask.status ?? "")),
                };
            }

            return {
                taskId: currentTask.taskId,
                operation: currentTask.operation === "uninstall" ? "uninstall" : "install",
                status: String(currentTask.status ?? "PENDING"),
                completed: ["SUCCESS", "FAILURE", "CANCELLED"].includes(String(currentTask.status ?? "")),
                pluginName: plugin?.name,
                error: currentTask.error ?? null,
            };
        });
    }, [currentTask, plugin?.name]);

    useEffect(() => {
        const taskId = logTask?.taskId;
        if (!taskId) return;

        let cancelled = false;

        const readLog = async () => {
            try {
                const result = await fetchPluginTaskLog(taskId, taskLogOffsetRef.current);
                if (cancelled) return;

                if (result.text) {
                    setTaskLog((prev) => prev + result.text);
                }

                taskLogOffsetRef.current = result.nextOffset;
                setTaskLogError(null);

                setLogTask((prev) =>
                    prev && prev.taskId === taskId
                        ? {
                            ...prev,
                            status: String(result.status ?? prev.status),
                            completed:
                                Boolean(result.completed) ||
                                ["SUCCESS", "FAILURE", "CANCELLED"].includes(String(result.status ?? prev.status)),
                        }
                        : prev,
                );
            } catch (err: any) {
                if (cancelled) return;
                setTaskLogError(err?.message || "Failed to load task log");
            }
        };

        void readLog();

        const shouldPoll = !logTask.completed && !["SUCCESS", "FAILURE", "CANCELLED"].includes(String(logTask.status ?? ""));
        if (!shouldPoll) {
            return () => {
                cancelled = true;
            };
        }

        const timer = window.setInterval(() => {
            void readLog();
        }, 2000);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [logTask?.taskId, logTask?.status, logTask?.completed]);

    useEffect(() => {
        if (!autoScroll) return;

        const el = logContainerRef.current;
        if (!el) return;

        const frame = window.requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
        });

        return () => {
            window.cancelAnimationFrame(frame);
        };
    }, [taskLog, autoScroll, logExpanded, logTask?.taskId]);

    const isInstalling = useMemo(() => (pipName ? installing.has(pipName) : false), [installing, pipName]);
    const isRemoving = useMemo(() => (pipName ? removing.has(pipName) : false), [removing, pipName]);

    const isUpdateAvailable = Boolean(plugin?.installed && plugin?.toUpdate);
    const canInstallOrUpdate = !plugin?.installed || isUpdateAvailable;

    async function refreshPlugin() {
        if (!pipName) return;
        const updated = await fetchPlugin(pipName);
        if (!isMountedRef.current) return;
        setPlugin(updated);
    }

    function startLogViewer(taskId: string, operation: "install" | "uninstall") {
        setLogTask({
            taskId,
            operation,
            status: "PENDING",
            completed: false,
            pluginName: plugin?.name,
            error: null,
        });
        setTaskLog("");
        setTaskLogError(null);
        setLogExpanded(true);
        taskLogOffsetRef.current = 0;
    }

    function clearLogViewer() {
        setLogTask(null);
        setTaskLog("");
        setTaskLogError(null);
        setLogExpanded(false);
        taskLogOffsetRef.current = 0;
    }

    const handleInstallOrUpdate = async () => {
        if (!pipName) return;

        const wasUpdate = Boolean(plugin?.installed && plugin?.toUpdate);

        setError(null);
        setSuccess(null);

        startInstall(pipName);

        try {
            const started = await installPlugin(pipName, { skipBinaries });
            startLogViewer(started.taskId, "install");

            registerTask({
                taskId: started.taskId,
                pipName,
                pluginName: plugin?.name,
                operation: "install",
                initialStatus: started.status,
            });

            const finalTask = await waitForTask(started.taskId);

            setLogTask((prev) =>
                prev && prev.taskId === started.taskId
                    ? {
                        ...prev,
                        status: String(finalTask.status ?? prev.status),
                        completed: true,
                        error: finalTask.status === "FAILURE" ? String(finalTask.error ?? "Plugin operation failed") : null,
                    }
                    : prev,
            );

            if (finalTask.status === "FAILURE") {
                const msg =
                    typeof finalTask.error === "string" && finalTask.error.trim().length > 0
                        ? finalTask.error
                        : "Plugin operation failed";
                throw new Error(msg);
            }

            await refreshPlugin();
            finishInstall(pipName);

            if (!isMountedRef.current) return;

            const successMessage = wasUpdate
                ? skipBinaries
                    ? "Plugin updated successfully without installing binaries"
                    : "Plugin updated successfully"
                : skipBinaries
                    ? "Plugin installed successfully without installing binaries"
                    : "Plugin installed successfully";

            setSuccess(successMessage);
        } catch (err) {
            console.error(err);
            finishInstall(pipName);

            setLogTask((prev) =>
                prev
                    ? {
                        ...prev,
                        status: "FAILURE",
                        completed: true,
                        error: err instanceof Error ? err.message : "Error installing/updating the plugin",
                    }
                    : prev,
            );

            if (!isMountedRef.current) return;
            setError(err instanceof Error ? err.message : "Error installing/updating the plugin");
        }
    };

    const handleRemove = async () => {
        if (!pipName) return;

        setError(null);
        setSuccess(null);

        startRemove(pipName);

        try {
            const started = await uninstallPlugin(pipName);
            startLogViewer(started.taskId, "uninstall");

            registerTask({
                taskId: started.taskId,
                pipName,
                pluginName: plugin?.name,
                operation: "uninstall",
                initialStatus: started.status,
            });

            const finalTask = await waitForTask(started.taskId);

            setLogTask((prev) =>
                prev && prev.taskId === started.taskId
                    ? {
                        ...prev,
                        status: String(finalTask.status ?? prev.status),
                        completed: true,
                        error: finalTask.status === "FAILURE" ? String(finalTask.error ?? "Plugin operation failed") : null,
                    }
                    : prev,
            );

            if (finalTask.status === "FAILURE") {
                const msg =
                    typeof finalTask.error === "string" && finalTask.error.trim().length > 0
                        ? finalTask.error
                        : "Plugin operation failed";
                throw new Error(msg);
            }

            await refreshPlugin();
            finishRemove(pipName);

            if (!isMountedRef.current) return;
            setSuccess("Plugin removed successfully");
        } catch (err) {
            console.error(err);
            finishRemove(pipName);

            setLogTask((prev) =>
                prev
                    ? {
                        ...prev,
                        status: "FAILURE",
                        completed: true,
                        error: err instanceof Error ? err.message : "Error uninstalling the plugin",
                    }
                    : prev,
            );

            if (!isMountedRef.current) return;
            setError(err instanceof Error ? err.message : "Error uninstalling the plugin");
        }
    };

    const publishedDate = (() => {
        const uploadTime = plugin?.compatibleReleases?.[plugin.latestRelease]?.upload_time;
        if (!uploadTime) return "N/A";
        return uploadTime.split("T")[0];
    })();

    if (loading || !plugin) {
        return (
            <div className="mx-auto max-w-6xl px-4 py-6">
                <CardShell title="Plugin" subtitle="Loading plugin details...">
                    <div className="flex min-h-[240px] items-center justify-center">
                        <div className="flex flex-col items-center">
                            <div className="relative">
                                <div className="h-8 w-8 rounded-full border-2 border-gray-300 dark:border-gray-700" />
                                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-gray-700 dark:border-t-gray-200" />
                            </div>
                            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">Loading plugin...</p>
                        </div>
                    </div>
                </CardShell>
            </div>
        );
    }

    return (
        <motion.div
            className="mx-auto max-w-6xl space-y-6 px-4 py-6"
            initial={{ y: "100vh", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100vh", opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
        >
            <div className="flex items-center gap-3">
                <SecondaryButton onClick={() => navigate(-1)} className="h-11 w-11 px-0" title="Go back">
                    <AngleLeftIcon className="h-5 w-5" />
                </SecondaryButton>
            </div>

            <CardShell
                title={plugin.name}
                subtitle={`Latest release: v${plugin.latestRelease}`}
                right={
                    <div className="flex flex-wrap items-center gap-2">
                        {canInstallOrUpdate ? (
                            <div
                                className={classNames(
                                    crispText,
                                    "inline-flex flex-wrap items-center gap-2 rounded-2xl border p-1.5 shadow-sm",
                                    "border-gray-300/80 bg-gray-50/90",
                                    "dark:border-gray-700 dark:bg-slate-950/70",
                                )}
                            >
                                <label
                                    className={classNames(
                                        crispText,
                                        "group inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
                                        skipBinaries
                                            ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-200"
                                            : "border-transparent bg-white text-gray-700 hover:border-gray-300/80 dark:bg-slate-900 dark:text-gray-200 dark:hover:border-gray-700",
                                        isInstalling || isRemoving
                                            ? "cursor-not-allowed opacity-60"
                                            : "cursor-pointer",
                                    )}
                                    title="Install only the Python package and skip plugin binaries"
                                >
                                    <input
                                        type="checkbox"
                                        checked={skipBinaries}
                                        disabled={isInstalling || isRemoving}
                                        onChange={(event) => setSkipBinaries(event.target.checked)}
                                        className="sr-only"
                                    />

                                    <span
                                        className={classNames(
                                            "inline-flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-bold transition",
                                            skipBinaries
                                                ? "border-sky-600 bg-sky-600 text-white"
                                                : "border-gray-300 bg-white text-transparent group-hover:border-gray-400 dark:border-gray-600 dark:bg-slate-950",
                                        )}
                                    >
                                        ✓
                                    </span>

                                    <span className="flex flex-col leading-tight">
                                        <span>Skip binaries</span>
                                        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                            Python package only
                                        </span>
                                    </span>
                                </label>

                                <PrimaryButton
                                    onClick={handleInstallOrUpdate}
                                    disabled={isInstalling}
                                    title={isUpdateAvailable ? "Update plugin" : "Install plugin"}
                                    className="h-10 px-4"
                                >
                                    {isInstalling ? (
                                        <>
                                            <ExecuteIcon className="h-4 w-4 animate-spin" />
                                            {isUpdateAvailable ? "Updating…" : "Installing…"}
                                        </>
                                    ) : isUpdateAvailable ? (
                                        <>
                                            Update
                                            <ArrowRight className="h-4 w-4" />
                                        </>
                                    ) : (
                                        <>
                                            Install
                                            <ArrowRight className="h-4 w-4" />
                                        </>
                                    )}
                                </PrimaryButton>
                            </div>
                        ) : null}

                        <SecondaryButton
                            onClick={handleRemove}
                            disabled={isRemoving || !plugin.installed}
                            title="Remove plugin"
                            className={classNames(
                                plugin.installed
                                    ? "border-red-300/80 text-red-700 hover:border-red-400 dark:border-red-900/50 dark:text-red-300 dark:hover:border-red-800"
                                    : "",
                            )}
                        >
                            {isRemoving ? (
                                <>
                                    <ExecuteIcon className="h-4 w-4 animate-spin" />
                                    Removing…
                                </>
                            ) : (
                                "Remove"
                            )}
                        </SecondaryButton>
                    </div>
                }
            >
                <div className="flex flex-col gap-6 xl:flex-row">
                    <div className="flex shrink-0 justify-center xl:block">
                        {plugin.fullLogo ? (
                            <img
                                src={plugin.fullLogo}
                                alt={`${plugin.name} logo`}
                                className="h-40 w-40 rounded-2xl border border-gray-300/80 bg-white object-contain p-3 shadow-sm dark:border-gray-700 dark:bg-slate-900"
                            />
                        ) : (
                            <div className="h-40 w-40 rounded-2xl border border-gray-300/80 bg-gray-100 shadow-sm dark:border-gray-700 dark:bg-slate-800" />
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <StatPill label="Installed" value={plugin.installed ? `v${plugin.pipVersion ?? "-"}` : "No"} />
                            <StatPill label="Latest" value={`v${plugin.latestRelease}`} />
                            <StatPill label="Published" value={publishedDate} />
                            <StatPill label="Mode" value={plugin.devel || plugin.installMode === "devel" ? "Devel" : "Standard"} />
                        </div>

                        {currentTask ? (
                            <div className="mt-4 rounded-xl border border-gray-300/80 bg-gray-50/80 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-slate-800/70 dark:text-gray-300">
                                <div className="flex items-center gap-2 font-semibold text-gray-950 dark:text-white">
                                    <ExecuteIcon className="h-4 w-4 animate-spin" />
                                    Active task: {currentTask.operation === "install-devel" ? "Install devel" : currentTask.operation === "install" ? "Install/Update" : "Uninstall"}
                                </div>
                                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">Status: {currentTask.status}</div>
                                {currentStep ? (
                                    <div className="mt-1 break-all text-xs text-gray-600 dark:text-gray-300">{currentStep}</div>
                                ) : null}
                                {currentTask.error ? (
                                    <div className="mt-2 break-all text-xs text-red-600 dark:text-red-300">{currentTask.error}</div>
                                ) : null}
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mt-4 rounded-xl border border-red-200/80 bg-red-50 p-4 text-sm leading-6 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                                {error}
                            </div>
                        ) : null}

                        {success ? (
                            <div className="mt-4 rounded-xl border border-green-200/80 bg-green-50 p-4 text-sm leading-6 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
                                {success}
                            </div>
                        ) : null}

                        {plugin.devel || plugin.installMode === "devel" ? (
                            <div className="mt-5 rounded-xl border border-indigo-200/80 bg-indigo-50 p-4 shadow-sm dark:border-indigo-900/50 dark:bg-indigo-950/30">
                                <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-200">Local devel source</div>
                                <div className="mt-2 break-all text-sm leading-6 text-indigo-900 dark:text-indigo-100">{plugin.localPath || "N/A"}</div>
                            </div>
                        ) : null}

                        <div className="mt-5 rounded-xl border border-gray-300/80 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-slate-900">
                            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">Summary</div>
                            <div className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{plugin.summary ?? "General"}</div>
                        </div>
                    </div>
                </div>
            </CardShell>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoCard icon={<FolderIcon className="h-5 w-5" />} title="Pip name">
                    <div className="break-all font-medium text-gray-950 dark:text-white">{plugin.pipName}</div>
                </InfoCard>

                <InfoCard icon={<GroupIcon className="h-5 w-5" />} title="Author">
                    {plugin.author ? (
                        <div className="flex flex-wrap gap-2">
                            {plugin.author.split(",").map((name, index) => (
                                <span
                                    key={index}
                                    className="inline-block max-w-full truncate rounded-full border border-gray-300/80 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800 dark:border-gray-700 dark:bg-slate-800 dark:text-white"
                                    title={name.trim()}
                                >
                                    {name.trim()}
                                </span>
                            ))}
                        </div>
                    ) : (
                        "Unknown"
                    )}
                </InfoCard>

                <InfoCard icon={<HelpIcon className="h-5 w-5" />} title="Summary">
                    {plugin.summary ?? "General"}
                </InfoCard>

                <InfoCard icon={<HomeIcon className="h-5 w-5" />} title="Home page">
                    {plugin.homePage ? (
                        <a
                            href={plugin.homePage}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-words text-gray-800 underline dark:text-white"
                        >
                            {plugin.homePage}
                        </a>
                    ) : (
                        "N/A"
                    )}
                </InfoCard>
            </div>

            {logTask || taskLog || taskLogError ? (
                <LogViewer
                    logTask={logTask}
                    taskLog={taskLog}
                    taskLogError={taskLogError}
                    autoScroll={autoScroll}
                    expanded={logExpanded}
                    onToggleAutoScroll={() => setAutoScroll((prev) => !prev)}
                    onClear={clearLogViewer}
                    onToggleExpanded={() => setLogExpanded((prev) => !prev)}
                    logContainerRef={logContainerRef}
                />
            ) : null}
        </motion.div>
    );
}