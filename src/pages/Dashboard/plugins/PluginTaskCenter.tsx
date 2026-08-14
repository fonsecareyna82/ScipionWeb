import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import {
  acknowledgePluginTask,
  fetchPluginTaskLog,
} from "@/api/plugins";
import type { PluginTask } from "@/hooks/useProcessingPlugins";
import {
  classNames,
  formatTimeAgo,
  getTaskOperationLabel,
} from "./plugin_helpers";


type PluginTaskCenterProps = {
  tasks: PluginTask[];
  onOpenPlugin: (pipName: string) => void;
  onTasksChanged: () => Promise<void>;
};


function normalizeStatus(status: string): string {
  return String(status || "UNKNOWN")
    .trim()
    .toUpperCase();
}


function isTerminalStatus(status: string): boolean {
  const normalized = normalizeStatus(status);

  return (
    normalized === "SUCCESS" ||
    normalized === "FAILURE" ||
    normalized === "CANCELLED"
  );
}


function isFailedStatus(status: string): boolean {
  return normalizeStatus(status) === "FAILURE";
}


function isCompletedStatus(status: string): boolean {
  const normalized = normalizeStatus(status);

  return (
    normalized === "SUCCESS" ||
    normalized === "CANCELLED"
  );
}


function isRunningStatus(status: string): boolean {
  return !isTerminalStatus(status);
}


function stripAnsi(value: string): string {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /\x1B\[[0-?]*[ -/]*[@-~]/g,
    "",
  );
}


function formatDuration(task: PluginTask): string {
  const start = task.startedAtMs || task.createdAtMs;
  const end = task.finishedAtMs || Date.now();

  const seconds = Math.max(
    0,
    Math.floor(
      (end - start) / 1000,
    ),
  );

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(
    seconds / 60,
  );

  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }

  const hours = Math.floor(
    minutes / 60,
  );

  return `${hours}h ${minutes % 60}m`;
}


function getStatusClasses(status: string): string {
  const normalized = normalizeStatus(status);

  if (normalized === "SUCCESS") {
    return [
      "border-emerald-200 bg-emerald-50 text-emerald-700",
      "dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
    ].join(" ");
  }

  if (normalized === "FAILURE") {
    return [
      "border-red-200 bg-red-50 text-red-700",
      "dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300",
    ].join(" ");
  }

  if (normalized === "CANCELLED") {
    return [
      "border-gray-300 bg-gray-100 text-gray-700",
      "dark:border-gray-700 dark:bg-white/[0.05] dark:text-gray-300",
    ].join(" ");
  }

  return [
    "border-blue-200 bg-blue-50 text-blue-700",
    "dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300",
  ].join(" ");
}


function TaskStatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized = normalizeStatus(
    status,
  );

  return (
    <span
      className={classNames(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
        getStatusClasses(
          normalized,
        ),
      )}
    >
      {isRunningStatus(normalized) ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : null}

      {normalized}
    </span>
  );
}


function TaskActionButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={classNames(
        "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition",
        props.danger
          ? [
              "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100",
              "dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50",
            ].join(" ")
          : [
              "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
              "dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/[0.06]",
            ].join(" "),
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {props.children}
    </button>
  );
}


function TaskSection(props: {
  title: string;
  description: string;
  tasks: PluginTask[];
  icon: React.ReactNode;
  emptyText: string;
  children: (task: PluginTask) => React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="flex items-center justify-between gap-4 border-b border-gray-200/70 px-4 py-3 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-200">
            {props.icon}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {props.title}
              </h3>

              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-300">
                {props.tasks.length}
              </span>
            </div>

            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {props.description}
            </p>
          </div>
        </div>
      </div>

      {props.tasks.length > 0 ? (
        <div className="divide-y divide-gray-200/70 dark:divide-gray-800/70">
          {props.tasks.map(
            props.children,
          )}
        </div>
      ) : (
        <div className="px-5 py-7 text-center text-sm text-gray-500 dark:text-gray-400">
          {props.emptyText}
        </div>
      )}
    </section>
  );
}


export default function PluginTaskCenter({
  tasks,
  onOpenPlugin,
  onTasksChanged,
}: PluginTaskCenterProps) {
  const [logTask, setLogTask] =
    useState<PluginTask | null>(
      null,
    );

  const [logText, setLogText] =
    useState("");

  const [logError, setLogError] =
    useState<string | null>(
      null,
    );

  const [logLoading, setLogLoading] =
    useState(false);

  const [
    dismissingTaskIds,
    setDismissingTaskIds,
  ] = useState<Set<string>>(
    new Set(),
  );

  const [copiedKey, setCopiedKey] =
    useState<string | null>(
      null,
    );

  const logOffsetRef = useRef(0);
  const logCompletedRef =
    useRef(false);
  const logRequestInFlightRef =
    useRef(false);

  const logViewportRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const runningTasks = useMemo(
    () =>
      tasks.filter((task) =>
        isRunningStatus(
          task.status,
        ),
      ),
    [tasks],
  );

  const failedTasks = useMemo(
    () =>
      tasks.filter((task) =>
        isFailedStatus(
          task.status,
        ),
      ),
    [tasks],
  );

  const completedTasks = useMemo(
    () =>
      tasks.filter((task) =>
        isCompletedStatus(
          task.status,
        ),
      ),
    [tasks],
  );

  const currentLogTask =
    useMemo(() => {
      if (!logTask) {
        return null;
      }

      return (
        tasks.find(
          (task) =>
            task.taskId ===
            logTask.taskId,
        ) ?? logTask
      );
    }, [logTask, tasks]);

  const cleanLogText = useMemo(
    () =>
      stripAnsi(
        logText,
      ),
    [logText],
  );

  useEffect(() => {
    if (!logTask) {
      return;
    }

    let cancelled = false;

    logOffsetRef.current = 0;
    logCompletedRef.current =
      false;
    logRequestInFlightRef.current =
      false;

    setLogText("");
    setLogError(null);
    setLogLoading(true);

    async function readAvailableLog() {
      if (
        cancelled ||
        logRequestInFlightRef.current ||
        logCompletedRef.current
      ) {
        return;
      }

      logRequestInFlightRef.current =
        true;

      try {
        for (
          let chunkIndex = 0;
          chunkIndex < 8;
          chunkIndex += 1
        ) {
          const offset =
            logOffsetRef.current;

          const response =
            await fetchPluginTaskLog(
              logTask.taskId,
              offset,
              65536,
            );

          if (cancelled) {
            return;
          }

          if (response.text) {
            setLogText(
              (current) =>
                current +
                response.text,
            );
          }

          const nextOffset =
            Math.max(
              offset,
              response.nextOffset,
            );

          const madeProgress =
            nextOffset > offset;

          logOffsetRef.current =
            nextOffset;

          if (
            response.completed &&
            (
              !response.text ||
              response.text.length <
                65536
            )
          ) {
            logCompletedRef.current =
              true;
          }

          if (
            !madeProgress ||
            response.text.length <
              65536
          ) {
            break;
          }
        }

        if (!cancelled) {
          setLogError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLogError(
            error instanceof Error
              ? error.message
              : String(error),
          );
        }
      } finally {
        logRequestInFlightRef.current =
          false;

        if (!cancelled) {
          setLogLoading(false);
        }
      }
    }

    void readAvailableLog();

    const timer =
      window.setInterval(
        () => {
          void readAvailableLog();
        },
        1200,
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        timer,
      );
    };
  }, [logTask?.taskId]);

  useEffect(() => {
    const viewport =
      logViewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTop =
      viewport.scrollHeight;
  }, [logText]);

  async function copyValue(
    key: string,
    value: string,
  ) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        value,
      );

      setCopiedKey(
        key,
      );

      window.setTimeout(
        () => {
          setCopiedKey(
            (current) =>
              current === key
                ? null
                : current,
          );
        },
        1600,
      );
    } catch (error) {
      console.error(
        "Could not copy task text",
        error,
      );
    }
  }

  async function dismissTask(
    task: PluginTask,
  ) {
    if (
      !isTerminalStatus(
        task.status,
      )
    ) {
      return;
    }

    setDismissingTaskIds(
      (current) => {
        const next = new Set(
          current,
        );

        next.add(
          task.taskId,
        );

        return next;
      },
    );

    try {
      await acknowledgePluginTask(
        task.taskId,
      );

      if (
        logTask?.taskId ===
        task.taskId
      ) {
        setLogTask(
          null,
        );
      }

      await onTasksChanged();
    } catch (error) {
      console.error(
        "Could not dismiss plugin task",
        error,
      );
    } finally {
      setDismissingTaskIds(
        (current) => {
          const next = new Set(
            current,
          );

          next.delete(
            task.taskId,
          );

          return next;
        },
      );
    }
  }

  function canOpenPlugin(
    task: PluginTask,
  ): boolean {
    if (
      task.operation ===
      "install-batch"
    ) {
      return false;
    }

    return task.pipName.startsWith(
      "scipion-",
    );
  }

  function renderTask(
    task: PluginTask,
  ) {
    const failed =
      isFailedStatus(
        task.status,
      );

    const terminal =
      isTerminalStatus(
        task.status,
      );

    const dismissing =
      dismissingTaskIds.has(
        task.taskId,
      );

    return (
      <div
        key={task.taskId}
        className={classNames(
          "px-4 py-4 transition",
          failed
            ? "bg-red-50/30 dark:bg-red-950/[0.08]"
            : "hover:bg-gray-50/60 dark:hover:bg-white/[0.015]",
        )}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {task.pluginName ??
                  task.pipName}
              </div>

              <TaskStatusBadge
                status={task.status}
              />
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span>
                {task.pipName}
              </span>

              <span>
                {getTaskOperationLabel(
                  task.operation,
                )}
              </span>

              <span>
                {formatDuration(
                  task,
                )}
              </span>

              <span>
                Updated{" "}
                {formatTimeAgo(
                  task.updatedAtMs,
                )}
              </span>
            </div>

            {task.pipNames &&
            task.pipNames.length > 1 ? (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {
                  task.pipNames
                    .length
                }{" "}
                plugins in task
              </div>
            ) : null}

            {task.step ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-gray-200/80 bg-gray-50/70 px-3 py-2 text-xs text-gray-700 dark:border-gray-800 dark:bg-white/[0.025] dark:text-gray-300">
                {isRunningStatus(
                  task.status,
                ) ? (
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}

                <span className="break-words">
                  {task.step}
                </span>
              </div>
            ) : null}

            {task.error ? (
              <div className="mt-3 rounded-xl border border-red-200/80 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {task.error}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-[390px] xl:justify-end">
            <TaskActionButton
              onClick={() =>
                setLogTask(
                  task,
                )
              }
              title="View task log"
            >
              <FileText className="h-3.5 w-3.5" />
              View log
            </TaskActionButton>

            {task.error ? (
              <TaskActionButton
                onClick={() =>
                  void copyValue(
                    `error:${task.taskId}`,
                    task.error ??
                      "",
                  )
                }
                title="Copy error"
              >
                <Copy className="h-3.5 w-3.5" />

                {copiedKey ===
                `error:${task.taskId}`
                  ? "Copied"
                  : "Copy error"}
              </TaskActionButton>
            ) : null}

            {canOpenPlugin(task) ? (
              <TaskActionButton
                onClick={() =>
                  onOpenPlugin(
                    task.pipName,
                  )
                }
                title="Open plugin"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Plugin
              </TaskActionButton>
            ) : null}

            {terminal ? (
              <TaskActionButton
                onClick={() =>
                  void dismissTask(
                    task,
                  )
                }
                disabled={
                  dismissing
                }
                danger={
                  failed
                }
                title="Dismiss task from this list"
              >
                {dismissing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}

                Dismiss
              </TaskActionButton>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <div className="space-y-4 pb-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-blue-600 dark:text-blue-300" />

                  <div>
                    <div className="text-2xl font-semibold text-blue-900 dark:text-blue-100">
                      {
                        runningTasks.length
                      }
                    </div>

                    <div className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      Running
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-red-200/80 bg-red-50/70 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                <div className="flex items-center gap-3">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-300" />

                  <div>
                    <div className="text-2xl font-semibold text-red-900 dark:text-red-100">
                      {
                        failedTasks.length
                      }
                    </div>

                    <div className="text-xs font-medium text-red-700 dark:text-red-300">
                      Failed
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />

                  <div>
                    <div className="text-2xl font-semibold text-emerald-900 dark:text-emerald-100">
                      {
                        completedTasks.length
                      }
                    </div>

                    <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      Completed
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <TaskSection
              title="Running"
              description="Plugin operations currently executing."
              tasks={runningTasks}
              icon={
                <Activity className="h-4 w-4" />
              }
              emptyText="No plugin tasks are currently running."
            >
              {renderTask}
            </TaskSection>

            <TaskSection
              title="Failed"
              description="Tasks that require attention. They remain here until dismissed."
              tasks={failedTasks}
              icon={
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-300" />
              }
              emptyText="No failed plugin tasks."
            >
              {renderTask}
            </TaskSection>

            <TaskSection
              title="Completed"
              description="Successfully completed or cancelled plugin operations."
              tasks={completedTasks}
              icon={
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
              }
              emptyText="No completed plugin tasks yet."
            >
              {renderTask}
            </TaskSection>

            {tasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
                <Activity className="mx-auto h-8 w-8 text-gray-400" />

                <div className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  No plugin tasks
                </div>

                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Install, update or remove a plugin and its task will appear here.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {currentLogTask ? (
        <div className="fixed inset-0 z-[200]">
          <button
            type="button"
            aria-label="Close task log"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
            onClick={() =>
              setLogTask(
                null,
              )
            }
          />

          <aside className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-slate-950">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                    {currentLogTask.pluginName ??
                      currentLogTask.pipName}
                  </h2>

                  <TaskStatusBadge
                    status={
                      currentLogTask.status
                    }
                  />
                </div>

                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {getTaskOperationLabel(
                    currentLogTask.operation,
                  )}{" "}
                  · Task{" "}
                  {
                    currentLogTask.taskId
                  }
                </div>

                {currentLogTask.step ? (
                  <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                    {
                      currentLogTask.step
                    }
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() =>
                  setLogTask(
                    null,
                  )
                }
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-white"
                aria-label="Close log"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {currentLogTask.error ? (
              <div className="shrink-0 border-b border-red-200 bg-red-50 px-5 py-3 text-xs leading-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {
                  currentLogTask.error
                }
              </div>
            ) : null}

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-800">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <FileText className="h-4 w-4" />

                {logLoading &&
                !logText
                  ? "Loading log..."
                  : `${cleanLogText.split(/\r?\n/).filter(Boolean).length} lines`}
              </div>

              <TaskActionButton
                onClick={() =>
                  void copyValue(
                    `log:${currentLogTask.taskId}`,
                    cleanLogText,
                  )
                }
                disabled={
                  !cleanLogText
                }
                title="Copy complete log"
              >
                <Copy className="h-3.5 w-3.5" />

                {copiedKey ===
                `log:${currentLogTask.taskId}`
                  ? "Copied"
                  : "Copy log"}
              </TaskActionButton>
            </div>

            {logError ? (
              <div className="shrink-0 border-b border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {logError}
              </div>
            ) : null}

            <div
              ref={
                logViewportRef
              }
              className="min-h-0 flex-1 overflow-auto bg-slate-950 p-5"
            >
              {cleanLogText ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-200">
                  {cleanLogText}
                </pre>
              ) : (
                <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-slate-400">
                  {logLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading task log...
                    </div>
                  ) : (
                    "No log output available."
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}