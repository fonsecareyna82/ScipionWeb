import React from "react";
import { X, RefreshCw } from "lucide-react";

export interface ProjectWorkflow {
  id: string;
  name: string;
  description: string;
}

interface ProjectWorkflowsPanelProps {
  open: boolean;
  onClose: () => void;
  workflows: ProjectWorkflow[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onWorkflowClick?: (workflow: ProjectWorkflow) => void;
  onWorkflowDoubleClick?: (workflow: ProjectWorkflow) => void;
}

export function ProjectWorkflowsPanel({
  open,
  onClose,
  workflows,
  loading = false,
  errorMessage = null,
  onRetry,
  onWorkflowClick,
  onWorkflowDoubleClick,
}: ProjectWorkflowsPanelProps) {
  const hasWorkflows = Array.isArray(workflows) && workflows.length > 0;

  return (
    <div className="pointer-events-none absolute inset-y-1 right-0 z-[70] flex justify-end">
      <div
        className={[
          "h-full w-[710px] max-w-[95vw]",
          "transform transition-all duration-300 ease-out",
          open
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none translate-x-full opacity-0",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r text-gray-200  from-gray-800 to-gray-700 dark:from-gray-800 dark:to-gray-700 border-b border-gray-300 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[18px] text-gray-200 mb-2">
                Workflows
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-50 text-gray-500 hover:text-gray-900 dark:hover:text-white bg-gray-200 dark:bg-gray-800 rounded-full w-8 h-8 shadow-lg"
            >
              <X className="ml-1"/>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loading ? (
              <div className="flex flex-col gap-2 text-[12px] text-gray-600 dark:text-gray-300">
                <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                  <span>Loading workflows for this project…</span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  This may take a few seconds the first time.
                </p>
              </div>
            ) : errorMessage ? (
              <div className="flex flex-col gap-2 text-[12px]">
                <span className="font-medium text-red-500">
                  Could not load workflows.
                </span>
                <span className="text-[11px] text-red-400 truncate">
                  {errorMessage}
                </span>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-1 self-start rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </button>
                )}
              </div>
            ) : !hasWorkflows ? (
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                No workflows defined yet. You can add predefined pipelines later.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Header row */}
                <div className="grid grid-cols-[minmax(140px,1.1fr)_minmax(220px,1.9fr)] gap-x-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 pb-1">
                  <span>Workflow</span>
                  <span>Description</span>
                </div>

                {/* Rows */}
                <div className="space-y-2 text-[12px]">
                  {workflows.map((wf) => (
                    <button
                      key={wf.id}
                      type="button"
                      onClick={() => onWorkflowClick?.(wf)}
                      onDoubleClick={() => onWorkflowDoubleClick?.(wf)}
                      className="grid grid-cols-[minmax(140px,1.1fr)_minmax(220px,1.9fr)] gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-left cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
                    >
                      <div className="font-medium text-gray-900 dark:text-gray-50 text-[13px] truncate">
                        {wf.name}
                      </div>
                      <div className="text-gray-600 dark:text-gray-300 text-[12px] leading-snug whitespace-pre-line">
                        {wf.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 text-[11px] text-gray-600 dark:text-gray-400">
            Click or double-click a workflow to use it once actions are available.
          </div>
        </div>
      </div>
    </div>
  );
}
