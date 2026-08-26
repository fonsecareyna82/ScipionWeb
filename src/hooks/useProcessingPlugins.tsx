// src/hooks/useProcessingPlugins.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import {
  fetchPluginTasks,
  type PersistentPluginTask,
  type PluginTaskBackend,
  type TaskStatusResponse,
} from "@/api/plugins";
import { useQueryClient } from "@tanstack/react-query";

export type PluginTaskOperation =
  | "install"
  | "install-batch"
  | "install-devel"
  | "uninstall";

export type PluginTask = {
  taskId: string;
  pipName: string;
  pipNames?: string[];
  pluginName?: string;
  operation: PluginTaskOperation;
  status: string;
  error?: string | null;
  step?: string | null;
  result?: unknown;
  meta?: unknown;
  backend?: PluginTaskBackend;
  acknowledged?: boolean;
  retryOfTaskId?: string | null;
  createdAtMs: number;
  startedAtMs: number;
  finishedAtMs?: number | null;
  updatedAtMs: number;
};

type ProcessingContextType = {
  installing: Set<string>;
  removing: Set<string>;

  startInstall: (pip: string) => void;
  finishInstall: (pip: string) => void;
  startRemove: (pip: string) => void;
  finishRemove: (pip: string) => void;

  tasks: PluginTask[];

  registerTask: (task: {
    taskId: string;
    pipName: string;
    pipNames?: string[];
    pluginName?: string;
    operation: PluginTaskOperation;
    initialStatus?: string;
  }) => void;

  waitForTask: (taskId: string) => Promise<TaskStatusResponse>;
  refreshTasks: () => Promise<void>;

  clearProcessingState: () => void;
};

const LEGACY_STORAGE_KEYS = [
  "processing-plugins",
  "processing-plugins-v2",
];

const ProcessingCtx = createContext<ProcessingContextType | null>(
  null,
);

type Deferred = {
  promise: Promise<TaskStatusResponse>;
  resolve: (value: TaskStatusResponse) => void;
  reject: (error: unknown) => void;
};

function createDeferred(): Deferred {
  let resolve!: (value: TaskStatusResponse) => void;
  let reject!: (error: unknown) => void;

  const promise = new Promise<TaskStatusResponse>(
    (resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    },
  );

  return {
    promise,
    resolve,
    reject,
  };
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "UNKNOWN")
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

function isInstallOperation(
  operation: PluginTaskOperation,
): boolean {
  return (
    operation === "install" ||
    operation === "install-batch" ||
    operation === "install-devel"
  );
}

function getTaskNotificationSubject(
  task: PluginTask,
): string {
  if (
    task.operation === "install-batch" &&
    task.pipNames &&
    task.pipNames.length > 1
  ) {
    return `${task.pipNames.length} plugins`;
  }

  return (
    task.pluginName ||
    task.pipName ||
    "Plugin task"
  );
}


function getTaskNotificationOperation(
  operation: PluginTaskOperation,
): string {
  if (operation === "uninstall") {
    return "Uninstall";
  }

  if (operation === "install-batch") {
    return "Batch installation";
  }

  if (operation === "install-devel") {
    return "Development installation";
  }

  return "Installation";
}


function getTaskErrorSummary(
  error: string | null | undefined,
): string {
  const value = String(
    error ?? "",
  )
    .replace(/\s+/g, " ")
    .trim();

  if (value.length <= 180) {
    return value;
  }

  return `${value.slice(0, 177)}...`;
}


function notifyTerminalTask(
  task: PluginTask,
): void {
  const status = normalizeStatus(
    task.status,
  );

  const subject =
    getTaskNotificationSubject(
      task,
    );

  const operation =
    getTaskNotificationOperation(
      task.operation,
    );

  const toastId =
    `plugin-task-${task.taskId}-${status}`;

  if (status === "SUCCESS") {
    toast.success(
      `${subject}: ${operation} completed`,
      {
        id: toastId,
      },
    );

    return;
  }

  if (status === "FAILURE") {
    const error =
      getTaskErrorSummary(
        task.error,
      );

    toast.error(
      error
        ? `${subject}: ${operation} failed — ${error}`
        : `${subject}: ${operation} failed`,
      {
        id: toastId,
        duration: 8000,
      },
    );
  }
}

function getTaskPipNames(
  task: Pick<PluginTask, "pipName" | "pipNames">,
): string[] {
  if (
    Array.isArray(task.pipNames) &&
    task.pipNames.length > 0
  ) {
    return task.pipNames;
  }

  return task.pipName
    ? [task.pipName]
    : [];
}

function parseDateMs(
  value: string | null | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function getPayloadPluginNames(
  payload: Record<string, unknown>,
): string[] {
  const rawPlugins = payload.plugins;

  if (!Array.isArray(rawPlugins)) {
    return [];
  }

  return rawPlugins
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value.trim().length > 0,
    )
    .map((value) => value.trim());
}

function mapPersistentTask(
  task: PersistentPluginTask,
): PluginTask {
  const now = Date.now();
  const payload = task.payload ?? {};

  const pipNames = getPayloadPluginNames(
    payload,
  );

  const payloadPluginName =
    typeof payload.pluginName === "string"
      ? payload.pluginName.trim()
      : "";

  const pipName =
    payloadPluginName ||
    pipNames[0] ||
    task.subject;

  const createdAtMs = parseDateMs(
    task.createdAt,
    now,
  );

  const startedAtMs = parseDateMs(
    task.startedAt,
    createdAtMs,
  );

  const updatedAtMs = parseDateMs(
    task.updatedAt,
    startedAtMs,
  );

  const finishedAtMs = task.finishedAt
    ? parseDateMs(
      task.finishedAt,
      updatedAtMs,
    )
    : null;

  return {
    taskId: task.taskId,
    pipName,
    pipNames:
      pipNames.length > 0
        ? pipNames
        : [pipName],
    pluginName:
      task.subjectLabel ??
      task.subject,
    operation:
      task.operation as PluginTaskOperation,
    status: normalizeStatus(
      task.status,
    ),
    error: task.error ?? null,
    step: task.step ?? null,
    result: task.result,
    meta: task.meta,
    backend:
      task.backend === "local"
        ? "local"
        : "celery",
    acknowledged:
      Boolean(task.acknowledged),
    retryOfTaskId:
      task.retryOfTaskId ?? null,
    createdAtMs,
    startedAtMs,
    finishedAtMs,
    updatedAtMs,
  };
}

function toTaskStatusResponse(
  task: PluginTask,
): TaskStatusResponse {
  return {
    taskId: task.taskId,
    status: task.status,
    result: task.result,
    error: task.error ?? null,
    meta: task.meta,
    backend: task.backend,
  };
}

export function ProcessingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [installing, setInstalling] = useState<Set<string>>(
    new Set(),
  );

  const [removing, setRemoving] = useState<Set<string>>(
    new Set(),
  );

  const [tasks, setTasks] = useState<PluginTask[]>(
    [],
  );

  const tasksRef = useRef<PluginTask[]>(
    [],
  );

  const deferredByIdRef = useRef<
    Map<string, Deferred>
  >(
    new Map(),
  );

  const refreshInFlightRef = useRef(
    false,
  );

  const queryClient = useQueryClient();

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const startInstall = useCallback(
    (pip: string) => {
      setInstalling(
        (current) =>
          new Set(current).add(
            pip,
          ),
      );
    },
    [],
  );

  const finishInstall = useCallback(
    (pip: string) => {
      setInstalling((current) => {
        const next = new Set(
          current,
        );

        next.delete(
          pip,
        );

        return next;
      });
    },
    [],
  );

  const startRemove = useCallback(
    (pip: string) => {
      setRemoving(
        (current) =>
          new Set(current).add(
            pip,
          ),
      );
    },
    [],
  );

  const finishRemove = useCallback(
    (pip: string) => {
      setRemoving((current) => {
        const next = new Set(
          current,
        );

        next.delete(
          pip,
        );

        return next;
      });
    },
    [],
  );

  const refreshTasks = useCallback(
    async () => {
      if (
        refreshInFlightRef.current
      ) {
        return;
      }

      refreshInFlightRef.current = true;

      try {
        const persistedTasks =
          await fetchPluginTasks({
            limit: 100,
          });

        const mappedTasks =
          persistedTasks
            .map(
              mapPersistentTask,
            )
            .sort(
              (a, b) =>
                b.updatedAtMs -
                a.updatedAtMs,
            );

        const serverTaskIds = new Set(
          mappedTasks.map(
            (task) =>
              task.taskId,
          ),
        );

        const now = Date.now();

        const localPendingTasks =
          tasksRef.current.filter(
            (task) =>
              !serverTaskIds.has(
                task.taskId,
              ) &&
              !isTerminalStatus(
                task.status,
              ) &&
              now -
              task.startedAtMs <
              10000,
          );

        const nextTasks = [
          ...mappedTasks,
          ...localPendingTasks,
        ].sort(
          (a, b) =>
            b.updatedAtMs -
            a.updatedAtMs,
        );

        const previousById =
          new Map(
            tasksRef.current.map(
              (task) => [
                task.taskId,
                task,
              ],
            ),
          );

        let shouldInvalidatePlugins =
          false;

        for (const task of nextTasks) {
          const previous =
            previousById.get(
              task.taskId,
            );

          if (
            isTerminalStatus(
              task.status,
            )
          ) {
            const deferred =
              deferredByIdRef.current.get(
                task.taskId,
              );

            if (deferred) {
              deferred.resolve(
                toTaskStatusResponse(
                  task,
                ),
              );

              deferredByIdRef.current.delete(
                task.taskId,
              );
            }

            if (
              previous &&
              !isTerminalStatus(
                previous.status,
              )
            ) {
              shouldInvalidatePlugins =
                true;

              notifyTerminalTask(
                task,
              );
            }

            if (
              isInstallOperation(
                task.operation,
              )
            ) {
              getTaskPipNames(
                task,
              ).forEach(
                finishInstall,
              );
            }

            if (
              task.operation ===
              "uninstall"
            ) {
              finishRemove(
                task.pipName,
              );
            }

            continue;
          }

          if (
            isInstallOperation(
              task.operation,
            )
          ) {
            getTaskPipNames(
              task,
            ).forEach(
              startInstall,
            );
          }

          if (
            task.operation ===
            "uninstall"
          ) {
            startRemove(
              task.pipName,
            );
          }
        }

        const trackedPipNames =
          new Set<string>();

        const activeInstallNames =
          new Set<string>();

        const activeRemoveNames =
          new Set<string>();

        for (const task of nextTasks) {
          const pipNames =
            getTaskPipNames(
              task,
            );

          pipNames.forEach(
            (pipName) =>
              trackedPipNames.add(
                pipName,
              ),
          );

          if (
            isTerminalStatus(
              task.status,
            )
          ) {
            continue;
          }

          if (
            isInstallOperation(
              task.operation,
            )
          ) {
            pipNames.forEach(
              (pipName) =>
                activeInstallNames.add(
                  pipName,
                ),
            );
          }

          if (
            task.operation ===
            "uninstall"
          ) {
            activeRemoveNames.add(
              task.pipName,
            );
          }
        }

        setInstalling(
          (current) => {
            const next = new Set(
              current,
            );

            trackedPipNames.forEach(
              (pipName) =>
                next.delete(
                  pipName,
                ),
            );

            activeInstallNames.forEach(
              (pipName) =>
                next.add(
                  pipName,
                ),
            );

            return next;
          },
        );

        setRemoving(
          (current) => {
            const next = new Set(
              current,
            );

            trackedPipNames.forEach(
              (pipName) =>
                next.delete(
                  pipName,
                ),
            );

            activeRemoveNames.forEach(
              (pipName) =>
                next.add(
                  pipName,
                ),
            );

            return next;
          },
        );

        setTasks(
          nextTasks,
        );

        if (
          shouldInvalidatePlugins
        ) {
          void queryClient.invalidateQueries({
            queryKey: [
              "plugins",
            ],
          });
        }
      } catch (error) {
        console.error(
          "Failed to refresh persistent plugin tasks",
          error,
        );
      } finally {
        refreshInFlightRef.current =
          false;
      }
    },
    [
      finishInstall,
      finishRemove,
      queryClient,
      startInstall,
      startRemove,
    ],
  );

  useEffect(() => {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(
        key,
      );
    }

    void refreshTasks();
  }, [refreshTasks]);

  const hasActiveTasks = useMemo(
    () =>
      tasks.some(
        (task) =>
          !isTerminalStatus(
            task.status,
          ),
      ),
    [tasks],
  );

  useEffect(() => {
    if (!hasActiveTasks) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          void refreshTasks();
        },
        3000,
      );

    return () =>
      window.clearInterval(
        timer,
      );
  }, [
    hasActiveTasks,
    refreshTasks,
  ]);

  const registerTask =
    useCallback<
      ProcessingContextType["registerTask"]
    >(
      (task) => {
        const now =
          Date.now();

        const initialStatus =
          normalizeStatus(
            task.initialStatus ??
            "PENDING",
          );

        const pipNames =
          Array.isArray(
            task.pipNames,
          ) &&
            task.pipNames.length > 0
            ? task.pipNames
            : [task.pipName];

        setTasks((current) => {
          if (
            current.some(
              (item) =>
                item.taskId ===
                task.taskId,
            )
          ) {
            return current;
          }

          return [
            {
              taskId:
                task.taskId,
              pipName:
                task.pipName,
              pipNames,
              pluginName:
                task.pluginName,
              operation:
                task.operation,
              status:
                initialStatus,
              error:
                null,
              step:
                null,
              createdAtMs:
                now,
              startedAtMs:
                now,
              finishedAtMs:
                null,
              updatedAtMs:
                now,
            },
            ...current,
          ];
        });

        if (
          !deferredByIdRef.current.has(
            task.taskId,
          )
        ) {
          deferredByIdRef.current.set(
            task.taskId,
            createDeferred(),
          );
        }

        if (
          isInstallOperation(
            task.operation,
          )
        ) {
          pipNames.forEach(
            startInstall,
          );
        }

        if (
          task.operation ===
          "uninstall"
        ) {
          startRemove(
            task.pipName,
          );
        }

        window.setTimeout(
          () => {
            void refreshTasks();
          },
          100,
        );
      },
      [
        refreshTasks,
        startInstall,
        startRemove,
      ],
    );

  const waitForTask =
    useCallback<
      ProcessingContextType["waitForTask"]
    >(
      (taskId) => {
        const existingTask =
          tasksRef.current.find(
            (task) =>
              task.taskId ===
              taskId,
          );

        if (
          existingTask &&
          isTerminalStatus(
            existingTask.status,
          )
        ) {
          return Promise.resolve(
            toTaskStatusResponse(
              existingTask,
            ),
          );
        }

        const existingDeferred =
          deferredByIdRef.current.get(
            taskId,
          );

        if (existingDeferred) {
          return existingDeferred.promise;
        }

        const deferred =
          createDeferred();

        deferredByIdRef.current.set(
          taskId,
          deferred,
        );

        return deferred.promise;
      },
      [],
    );

  const clearProcessingState =
    useCallback(
      () => {
        setInstalling(
          new Set(),
        );

        setRemoving(
          new Set(),
        );

        deferredByIdRef.current.clear();

        for (const key of LEGACY_STORAGE_KEYS) {
          localStorage.removeItem(
            key,
          );
        }

        void refreshTasks();

        void queryClient.invalidateQueries({
          queryKey: [
            "plugins",
          ],
        });
      },
      [
        queryClient,
        refreshTasks,
      ],
    );

  const value =
    useMemo<ProcessingContextType>(
      () => ({
        installing,
        removing,
        startInstall,
        finishInstall,
        startRemove,
        finishRemove,
        tasks,
        registerTask,
        waitForTask,
        refreshTasks,
        clearProcessingState,
      }),
      [
        installing,
        removing,
        startInstall,
        finishInstall,
        startRemove,
        finishRemove,
        tasks,
        registerTask,
        waitForTask,
        refreshTasks,
        clearProcessingState,
      ],
    );

  return (
    <ProcessingCtx.Provider
      value={value}
    >
      {children}
    </ProcessingCtx.Provider>
  );
}

export function useProcessingPlugins() {
  const context =
    useContext(
      ProcessingCtx,
    );

  if (!context) {
    throw new Error(
      "useProcessingPlugins must be under <ProcessingProvider>",
    );
  }

  return context;
}