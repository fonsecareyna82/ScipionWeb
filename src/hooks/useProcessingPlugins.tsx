// src/hooks/useProcessingPlugins.tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getTaskStatus, type TaskStatusResponse } from "@/api/plugins";
import { useQueryClient } from "@tanstack/react-query";

export type PluginTaskOperation = "install" | "install-devel" | "uninstall";

export type PluginTask = {
  taskId: string;
  pipName: string;
  pluginName?: string;
  operation: PluginTaskOperation;
  status: string;
  error?: string | null;
  step?: string | null;
  startedAtMs: number;
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
    pluginName?: string;
    operation: PluginTaskOperation;
    initialStatus?: string;
  }) => void;
  waitForTask: (taskId: string) => Promise<TaskStatusResponse>;

  clearProcessingState: () => void;
};

const LS_KEY_V1 = "processing-plugins";
const LS_KEY_V2 = "processing-plugins-v2";

const ProcessingCtx = createContext<ProcessingContextType | null>(null);

type Deferred = {
  promise: Promise<TaskStatusResponse>;
  resolve: (v: TaskStatusResponse) => void;
  reject: (e: unknown) => void;
};

function createDeferred(): Deferred {
  let resolve!: (v: TaskStatusResponse) => void;
  let reject!: (e: unknown) => void;

  const promise = new Promise<TaskStatusResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function isTerminalStatus(status: string) {
  return status === "SUCCESS" || status === "FAILURE";
}

function isInstallOperation(operation: PluginTaskOperation) {
  return operation === "install" || operation === "install-devel";
}

export function ProcessingProvider({ children }: { children: React.ReactNode }) {
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [tasks, setTasks] = useState<PluginTask[]>([]);

  const tasksRef = useRef<PluginTask[]>([]);
  const deferredByIdRef = useRef<Map<string, Deferred>>(new Map());
  const pollingInFlightRef = useRef(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    // Load v2 first
    const rawV2 = localStorage.getItem(LS_KEY_V2);
    if (rawV2) {
      try {
        const parsed = JSON.parse(rawV2) as {
          inst?: string[];
          rem?: string[];
          tasks?: PluginTask[];
        };

        const loadedTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
        setTasks(loadedTasks);

        const inst = new Set(parsed.inst ?? []);
        const rem = new Set(parsed.rem ?? []);

        for (const t of loadedTasks) {
          if (isTerminalStatus(t.status)) continue;
          if (isInstallOperation(t.operation)) inst.add(t.pipName);
          if (t.operation === "uninstall") rem.add(t.pipName);
        }

        setInstalling(inst);
        setRemoving(rem);
        return;
      } catch {
        // Ignore malformed storage
      }
    }

    // Migrate from v1 if present
    const rawV1 = localStorage.getItem(LS_KEY_V1);
    if (!rawV1) return;

    try {
      const parsed = JSON.parse(rawV1) as { inst?: string[]; rem?: string[] };
      setInstalling(new Set(parsed.inst ?? []));
      setRemoving(new Set(parsed.rem ?? []));
      setTasks([]);
      localStorage.removeItem(LS_KEY_V1);
    } catch {
      // Ignore malformed storage
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      LS_KEY_V2,
      JSON.stringify({
        inst: Array.from(installing),
        rem: Array.from(removing),
        tasks,
      })
    );
  }, [installing, removing, tasks]);

  const startInstall = (pip: string) => setInstalling((s) => new Set(s).add(pip));
  const finishInstall = (pip: string) =>
    setInstalling((s) => {
      const c = new Set(s);
      c.delete(pip);
      return c;
    });

  const startRemove = (pip: string) => setRemoving((s) => new Set(s).add(pip));
  const finishRemove = (pip: string) =>
    setRemoving((s) => {
      const c = new Set(s);
      c.delete(pip);
      return c;
    });

  const registerTask: ProcessingContextType["registerTask"] = (t) => {
    const now = Date.now();
    const initialStatus = t.initialStatus ?? "PENDING";

    setTasks((prev) => {
      if (prev.some((x) => x.taskId === t.taskId)) return prev;
      return [
        {
          taskId: t.taskId,
          pipName: t.pipName,
          pluginName: t.pluginName,
          operation: t.operation,
          status: initialStatus,
          error: null,
          step: null,
          startedAtMs: now,
          updatedAtMs: now,
        },
        ...prev,
      ];
    });

    if (!deferredByIdRef.current.has(t.taskId)) {
      deferredByIdRef.current.set(t.taskId, createDeferred());
    }

    if (isInstallOperation(t.operation)) startInstall(t.pipName);
    if (t.operation === "uninstall") startRemove(t.pipName);
  };

  const waitForTask: ProcessingContextType["waitForTask"] = (taskId) => {
    const existing = deferredByIdRef.current.get(taskId);
    if (existing) return existing.promise;

    const def = createDeferred();
    deferredByIdRef.current.set(taskId, def);
    return def.promise;
  };

  useEffect(() => {
    if (tasks.length === 0) return;

    const timer = window.setInterval(async () => {
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;

      try {
        const current = tasksRef.current;
        const active = current.filter((t) => !isTerminalStatus(t.status));
        if (active.length === 0) return;

        const results = await Promise.allSettled(active.map((t) => getTaskStatus(t.taskId)));

        // New: if any task reaches terminal state, refresh plugins list via react-query
        let shouldInvalidatePlugins = false;

        for (let i = 0; i < active.length; i++) {
          const settled = results[i];
          if (settled.status === "fulfilled") {
            if (isTerminalStatus(settled.value.status)) {
              shouldInvalidatePlugins = true;
            }
          } else {
            // A polling error effectively means the task is no longer reliable -> refresh list
            shouldInvalidatePlugins = true;
          }
        }

        setTasks((prev) => {
          const prevMap = new Map(prev.map((t) => [t.taskId, t]));
          const updated: PluginTask[] = [];

          for (let i = 0; i < active.length; i++) {
            const task = active[i];
            const settled = results[i];
            const existingTask = prevMap.get(task.taskId);
            if (!existingTask) continue;

            if (settled.status === "fulfilled") {
              const status = settled.value;

              let step: string | null = null;
              if (status && typeof status.meta === "object" && status.meta != null) {
                const metaObj = status.meta as Record<string, unknown>;
                const rawStep = metaObj["step"];
                if (typeof rawStep === "string") step = rawStep;
              }

              const nextStatus = status.status;
              const nextError = status.error ?? null;

              const hasTaskChanged =
                existingTask.status !== nextStatus ||
                existingTask.error !== nextError ||
                existingTask.step !== step;

              const next: PluginTask = {
                ...existingTask,
                status: nextStatus,
                error: nextError,
                step,
                updatedAtMs: hasTaskChanged ? Date.now() : existingTask.updatedAtMs,
              };

              if (isTerminalStatus(next.status)) {
                const def = deferredByIdRef.current.get(next.taskId);
                if (def) {
                  def.resolve(status);
                  deferredByIdRef.current.delete(next.taskId);
                }

                if (isInstallOperation(next.operation)) finishInstall(next.pipName);
                if (next.operation === "uninstall") finishRemove(next.pipName);

                prevMap.delete(task.taskId);
                continue;
              }

              updated.push(next);
              prevMap.delete(task.taskId);
            } else {
              const err = String(settled.reason ?? "Task polling failed");

              const def = deferredByIdRef.current.get(task.taskId);
              if (def) {
                def.resolve({ taskId: task.taskId, status: "FAILURE", error: err, result: null });
                deferredByIdRef.current.delete(task.taskId);
              }

              if (isInstallOperation(task.operation)) finishInstall(task.pipName);
              if (task.operation === "uninstall") finishRemove(task.pipName);

              prevMap.delete(task.taskId);
            }
          }

          for (const t of prevMap.values()) {
            if (isTerminalStatus(t.status)) continue;
            updated.push(t);
          }

          updated.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
          return updated;
        });

        if (shouldInvalidatePlugins) {
          void queryClient.invalidateQueries({ queryKey: ["plugins"] });
        }
      } finally {
        pollingInFlightRef.current = false;
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [tasks.length]);

  const clearProcessingState = () => {
    setInstalling(new Set());
    setRemoving(new Set());
    setTasks([]);
    localStorage.removeItem(LS_KEY_V2);
    deferredByIdRef.current.clear();
    void queryClient.invalidateQueries({ queryKey: ["plugins"] });
  };

  const value = useMemo<ProcessingContextType>(
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
      clearProcessingState,
    }),
    [installing, removing, tasks]
  );

  return <ProcessingCtx.Provider value={value}>{children}</ProcessingCtx.Provider>;
}

export function useProcessingPlugins() {
  const ctx = useContext(ProcessingCtx);
  if (!ctx) throw new Error("useProcessingPlugins must be under <ProcessingProvider>");
  return ctx;
}