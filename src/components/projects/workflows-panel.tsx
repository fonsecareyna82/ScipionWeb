import { useState } from "react";
import { X, RefreshCw, Search } from "lucide-react";
import toast from "react-hot-toast";

import { useProjectService } from "@/ProjectServiceContext";

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
  projectId: string | number;
  projectName?: string;
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
  projectId,
  projectName,
}: ProjectWorkflowsPanelProps) {
  const hasWorkflows = Array.isArray(workflows) && workflows.length > 0;

  const [selectedWorkflow, setSelectedWorkflow] =
    useState<ProjectWorkflow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleRowDoubleClick = (wf: ProjectWorkflow) => {
    onWorkflowDoubleClick?.(wf);
    setSelectedWorkflow(wf);
    setDialogOpen(true);
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredWorkflows = normalizedSearch
    ? workflows.filter((wf) =>
        (wf.name ?? "")
          .toString()
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : workflows;

  const hasFilteredWorkflows =
    Array.isArray(filteredWorkflows) && filteredWorkflows.length > 0;

  return (
    <>
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
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r text-gray-200 from-gray-800 to-gray-700 dark:from-gray-800 dark:to-gray-700 border-b border-gray-300 shadow-sm">
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
                <X className="ml-1" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading ? (
                <div className="flex flex-col gap-2 text-[12px] text-gray-600 dark:text-gray-300">
                  <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                    <span>Loading workflows…</span>
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
                  No workflows defined yet. You can add predefined pipelines
                  later.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Search */}
                  <div className="flex items-center justify-between">
                    <div className="relative w-full max-w-xs">
                      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center">
                        <Search className="h-4 w-4 text-slate-400" />
                      </span>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search workflow…"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-8 pr-2 py-1.5 text-xs text-slate-900 dark:text-slate-50 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500"
                      />
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden bg-white/80 dark:bg-slate-950/60">
                    {/* Header row */}
                    <div className="grid grid-cols-[minmax(140px,1.1fr)_minmax(220px,1.9fr)] gap-x-3 text-[11px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-slate-900 border-b border-gray-200 dark:border-gray-700 px-3 py-2">
                      <span>Workflow</span>
                      <span>Description</span>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-gray-200 dark:divide-gray-800 text-[12px]">
                      {!hasFilteredWorkflows ? (
                        <div className="px-3 py-3 text-[12px] text-gray-500 dark:text-gray-400">
                          No workflows match the current search.
                        </div>
                      ) : (
                        filteredWorkflows.map((wf) => (
                          <button
                            key={wf.id}
                            type="button"
                            onClick={() => onWorkflowClick?.(wf)}
                            onDoubleClick={() => handleRowDoubleClick(wf)}
                            className="w-full grid grid-cols-[minmax(140px,1.1fr)_minmax(220px,1.9fr)] gap-x-3 gap-y-1 px-3 py-2 text-left cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/80 active:bg-slate-200 dark:active:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 h-[112px]"
                          >
                            <div
                              className="font-medium text-gray-900 dark:text-gray-50 text-[13px] truncate"
                              title={wf.name}
                            >
                              {wf.name}
                            </div>
                            <div className="text-gray-600 dark:text-gray-300 text-[12px] leading-snug whitespace-pre-line h-[80px] overflow-y-auto pr-1">
                              {wf.description}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 text-[11px] text-gray-600 dark:text-gray-400">
              Double-click a workflow to apply it to the current project.
            </div>
          </div>
        </div>
      </div>

      <ApplyWorkflowToCurrentProjectDialog
        open={dialogOpen}
        workflow={selectedWorkflow}
        projectId={projectId}
        projectName={projectName}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}

interface ApplyWorkflowToCurrentProjectDialogProps {
  open: boolean;
  workflow: ProjectWorkflow | null;
  projectId: string | number;
  projectName?: string;
  onClose: () => void;
}

function ApplyWorkflowToCurrentProjectDialog({
  open,
  workflow,
  projectId,
  projectName,
  onClose,
}: ApplyWorkflowToCurrentProjectDialogProps) {
  const svc = useProjectService();

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!workflow) {
      onClose();
      return;
    }

    setSubmitError(null);
    setSubmitting(true);

    try {
      await svc.applyWorkflowToProject(projectId, {
        workflowId: String(workflow.id),
      });

      const targetName = projectName ?? String(projectId);

      toast.success(
        `Workflow "${workflow.name}" applied to project "${targetName}".`,
      );

      onClose();
    } catch (err: any) {
      console.error(
        "[ApplyWorkflowToCurrentProjectDialog] handleApply error:",
        err,
      );
      setSubmitError(
        err?.message || "Failed to apply workflow. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !workflow) return null;

  const applyDisabled = submitting;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-auto">
      {/* dialogCard */}
      <div className="relative z-10 w-full max-w-md min-h-[340px] max-h-[80vh] rounded-2xl bg-white dark:bg-slate-950 shadow-2xl border border-slate-200 dark:border-slate-800 px-6 pt-10 pb-5 flex flex-col">
        {/* closeButton */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 shadow-sm"
        >
          <X className="h-4 w-4" />
        </button>

        {/* mainContent */}
        <div className="flex-1 flex flex-col mt-1">
          {/* titleSection */}
          <div className="text-center mb-3">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
              Apply workflow
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {workflow.name}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              This workflow will be applied to the current project.
            </p>
          </div>

          {/* description */}
          {workflow.description && (
            <div className="mt-2 flex-1 mb-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Workflow description
              </div>
              <div className="max-h-40 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line overflow-y-auto">
                {workflow.description}
              </div>
            </div>
          )}

          {submitError && (
            <div className="mt-2 text-xs text-red-500">{submitError}</div>
          )}
        </div>

        {/* actions */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex min-w-[96px] items-center justify-center rounded-md border border-red-500 px-4 py-2 text-sm font-medium text-red-600 bg-white hover:bg-red-50 dark:bg-slate-950 dark:hover:bg-slate-900 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applyDisabled}
            className="inline-flex min-w-[96px] items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {submitting ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
