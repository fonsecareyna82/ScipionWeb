import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, GitBranch, RefreshCw, RotateCcw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";
import { Button } from "@/components/ui/button";
import { useProjectService } from "@/ProjectServiceContext";
import type { Id, ProtocolStep } from "@/services/ProjectService";

type Props = {
  open: boolean;
  projectId?: Id;
  protocolId?: Id;
  protocolLabel?: string;
  container?: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
};

function formatElapsed(value: unknown): string {
  const total = Number(value ?? 0);
  if (!Number.isFinite(total) || total <= 0) return "0:00:00";

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);

  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getStepClass(step: ProtocolStep): string {
  return String((step as any).className ?? (step as any).class ?? "FunctionStep");
}

function getStatusClass(status: string): string {
  const normalized = String(status ?? "").toLowerCase();

  if (normalized === "finished") return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (normalized === "running") return "bg-sky-100 text-sky-800 ring-sky-200";
  if (normalized === "failed") return "bg-red-100 text-red-800 ring-red-200";
  if (normalized === "aborted") return "bg-orange-100 text-orange-800 ring-orange-200";

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export default function ProtocolStepsDeveloperDialog({
  open,
  projectId,
  protocolId,
  protocolLabel,
  container,
  onOpenChange,
}: Props) {
  const svc = useProjectService();

  const [steps, setSteps] = useState<ProtocolStep[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStep = steps[selectedIndex] ?? null;

  const loadSteps = useCallback(async () => {
    if (!projectId || !protocolId) return;

    setLoading(true);
    setError(null);

    try {
      const items = await svc.fetchProtocolSteps(projectId, protocolId);
      setSteps(Array.isArray(items) ? items : []);
      setSelectedIndex(0);
    } catch (err: any) {
      setSteps([]);
      setError(err?.message || "Failed to load protocol steps.");
    } finally {
      setLoading(false);
    }
  }, [svc, projectId, protocolId]);

  useEffect(() => {
    if (!open) return;
    void loadSteps();
  }, [open, loadSteps]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        container={container ?? undefined}
        className="max-w-[1020px] p-0 overflow-hidden border border-border bg-background shadow-xl rounded-xl"
      >
        <DialogHeader
          className="border-b border-border"
          style={{
            backgroundColor: "#333d49",
            color: "white",
            padding: "24px 52px 12px 16px",
            boxSizing: "border-box",
          }}
        >
          <DialogTitle className="text-sm font-semibold leading-6 text-white text-center">
            Protocol steps{protocolLabel ? ` - ${protocolLabel}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="border-b border-border bg-slate-100 px-3 py-2 flex items-center gap-2 text-xs">
          <button
            type="button"
            disabled
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm disabled:opacity-60"
            title="Tree action will be implemented later"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Tree
          </button>

          <button
            type="button"
            disabled
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm disabled:opacity-60"
            title="Reset action will be implemented later"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>

          <button
            type="button"
            disabled
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm disabled:opacity-60"
            title="Finish action will be implemented later"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Finish
          </button>

          <Button
            type="button"
            variant="outline"
            className="ml-auto h-8 px-2.5 text-xs bg-white"
            onClick={() => void loadSteps()}
            disabled={loading || !projectId || !protocolId}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="h-[500px] bg-slate-100 p-3 flex gap-3">
          <div className="flex-1 min-w-0 bg-white overflow-auto border border-slate-300 rounded-md">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-slate-700">
                  <th className="border-b border-slate-300 px-2 py-1.5 text-left w-16">Index</th>
                  <th className="border-b border-slate-300 px-2 py-1.5 text-left">Step</th>
                  <th className="border-b border-slate-300 px-2 py-1.5 text-left w-28">Status</th>
                  <th className="border-b border-slate-300 px-2 py-1.5 text-left w-24">Time</th>
                  <th className="border-b border-slate-300 px-2 py-1.5 text-left w-32">Class</th>
                </tr>
              </thead>

              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-slate-600">
                      Loading steps...
                    </td>
                  </tr>
                )}

                {error && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-red-600">
                      {error}
                    </td>
                  </tr>
                )}

                {!loading && !error && steps.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-slate-600">
                      No steps.
                    </td>
                  </tr>
                )}

                {steps.map((step, idx) => {
                  const selected = idx === selectedIndex;
                  const status = String(step.status ?? "");

                  return (
                    <tr
                      key={`${step.index}-${step.name}`}
                      onClick={() => setSelectedIndex(idx)}
                      className={[
                        "cursor-default border-b border-slate-100",
                        selected
                          ? "bg-[#4f7391] text-white"
                          : "hover:bg-slate-50 text-slate-900",
                      ].join(" ")}
                    >
                      <td className="px-2 py-1 font-mono">{step.index}</td>
                      <td className="px-2 py-1 min-w-0">
                        <div className="truncate" title={`${step.index} - ${step.name}`}>
                          {step.index} - {step.name}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                            selected ? "bg-white/15 text-white ring-white/25" : getStatusClass(status),
                          ].join(" ")}
                        >
                          {status || "-"}
                        </span>
                      </td>
                      <td className="px-2 py-1 font-mono">{formatElapsed(step.elapsedSeconds)}</td>
                      <td className="px-2 py-1">{getStepClass(step)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <aside className="w-[315px] bg-white border border-slate-300 rounded-md overflow-hidden text-xs">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-700">
              Step details
            </div>

            <div className="p-3 overflow-auto h-[calc(100%-33px)] text-slate-800">
              {selectedStep ? (
                <div className="space-y-2">
                  <div>
                    <div className="font-semibold">Prerequisites:</div>
                    <pre className="m-0 whitespace-pre-wrap font-mono text-[11px]">
                      {formatValue(selectedStep.prerequisites ?? [])}
                    </pre>
                  </div>

                  <div>
                    <div className="font-semibold">Arguments:</div>
                    <pre className="m-0 whitespace-pre-wrap font-mono text-[11px]">
                      {formatValue(selectedStep.args) || "-"}
                    </pre>
                  </div>

                  {selectedStep.initTime && (
                    <div>
                      <span className="font-semibold">Init:</span> {selectedStep.initTime}
                    </div>
                  )}

                  {selectedStep.endTime && (
                    <div>
                      <span className="font-semibold">End:</span> {selectedStep.endTime}
                    </div>
                  )}

                  <div>
                    <span className="font-semibold">Needs GPU:</span>{" "}
                    {String(Boolean(selectedStep.needsGpu))}
                  </div>

                  <div>
                    <span className="font-semibold">Interactive:</span>{" "}
                    {String(Boolean(selectedStep.interactive))}
                  </div>

                  {selectedStep.event && (
                    <div>
                      <span className="font-semibold">Event:</span> {selectedStep.event}
                    </div>
                  )}

                  {selectedStep.error && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-700">
                      <span className="font-semibold">Error:</span> {selectedStep.error}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-slate-500">Select a step.</span>
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}