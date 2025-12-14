import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
} from "react";
import { RefreshCw, ArrowRightCircle, X } from "lucide-react";

import { useProjectService } from "@/ProjectServiceContext";
import type { ProjectWorkflow } from "@/components/projects/workflows-panel";

export default function WorkflowsPage() {
  const svc = useProjectService();

  const [workflows, setWorkflows] = useState<ProjectWorkflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedWorkflow, setSelectedWorkflow] =
    useState<ProjectWorkflow | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  const loadWorkflows = useCallback(async () => {
    // loadWorkflowsHandler
    setLoading(true);
    setErrorMessage(null);

    try {
      const data = await svc.fetchProjectWorkflows();

      const normalized: ProjectWorkflow[] = Array.isArray(data)
        ? data.map((wf: any) => ({
            id: String(wf.id ?? wf.name),
            name: wf.name ?? String(wf.id ?? ""),
            description: wf.description ?? "",
          }))
        : [];

      setWorkflows(normalized);
    } catch (err: any) {
      console.error("[WorkflowsPage] loadWorkflows error:", err);
      setErrorMessage(err?.message || "Failed to load workflows.");
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, [svc]);

  useEffect(() => {
    // initialLoadEffect
    void loadWorkflows();
  }, [loadWorkflows]);

  const handleWorkflowClick = (workflow: ProjectWorkflow) => {
    // workflowClickHandlerPlaceholder
    console.log("workflowClicked", workflow);
  };

  const handleWorkflowDoubleClick = (workflow: ProjectWorkflow) => {
    setSelectedWorkflow(workflow);
    setApplyDialogOpen(true);
  };

  const hasWorkflows = workflows.length > 0;

  return (
    <div className="h-app min-h-0 flex flex-col px-2 py-1">
      {/* headerSection */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl text-gray-900 dark:text-gray-50">
            Workflows
          </h1>
          <p className="mt-1 text-base text-gray-600 dark:text-gray-400">
            Predefined pipelines available in this Scipion instance.
          </p>
        </div>

        <button
          type="button"
          onClick={loadWorkflows}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-sm border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* contentSection */}
      <div className="flex-1 min-h-0">
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl bg-white/80 dark:bg-slate-950/60 shadow-sm overflow-hidden flex flex-col h-full">
          {/* tableHeader */}
          <div className="grid grid-cols-[minmax(220px,1.1fr)_minmax(360px,1.9fr)] gap-x-3 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2">
            <span>Workflow</span>
            <span>Description</span>
          </div>

          {/* tableBody */}
          <div className="flex-1 max-h-[calc(100vh-220px)] overflow-y-auto text-sm divide-y divide-gray-200 dark:divide-gray-800">
            {loading && (
              <div className="px-4 py-4 text-base text-gray-700 dark:text-gray-200">
                Loading workflows…
              </div>
            )}

            {!loading && errorMessage && (
              <div className="px-4 py-4 text-base text-red-500">
                {errorMessage}
              </div>
            )}

            {!loading && !errorMessage && !hasWorkflows && (
              <div className="px-4 py-4 text-base text-gray-500 dark:text-gray-400">
                No workflows defined yet.
              </div>
            )}

            {!loading &&
              !errorMessage &&
              hasWorkflows &&
              workflows.map((wf) => (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => handleWorkflowClick(wf)}
                  onDoubleClick={() => handleWorkflowDoubleClick(wf)}
                  className="w-full grid grid-cols-[minmax(220px,1.1fr)_minmax(360px,1.9fr)] gap-x-3 gap-y-1 px-4 py-3 text-left cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/80 active:bg-slate-200 dark:active:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 h-[120px]"
                >
                  <div
                    className="font-semibold text-gray-900 dark:text-gray-50 text-[14px] truncate"
                    title={wf.name}
                  >
                    {wf.name}
                  </div>
                  <div className="text-gray-700 dark:text-gray-300 text-sm leading-snug whitespace-pre-line h-[84px] overflow-y-auto pr-1">
                    {wf.description}
                  </div>
                </button>
              ))}
          </div>
        </div>
      </div>

      <ApplyWorkflowDialog
        open={applyDialogOpen}
        workflow={selectedWorkflow}
        onClose={() => setApplyDialogOpen(false)}
      />
    </div>
  );
}

interface ApplyWorkflowDialogProps {
  open: boolean;
  workflow: ProjectWorkflow | null;
  onClose: () => void;
}

type ApplyWorkflowMode = "create" | "select";

function ApplyWorkflowDialog({
  open,
  workflow,
  onClose,
}: ApplyWorkflowDialogProps) {
  const svc = useProjectService();

  const [mode, setMode] = useState<ApplyWorkflowMode>("create");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");

  const [projectOptions, setProjectOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  useEffect(() => {
    if (open && workflow) {
      setMode("create");
      setNewProjectTitle(workflow.name ?? "");
      setNewProjectDescription(workflow.description ?? "");
      setSelectedProjectId("");
    }
  }, [open, workflow]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadProjects = async () => {
      setProjectsLoading(true);
      setProjectsError(null);

      try {
        const data = await svc.fetchList();
        const normalized: Array<{ id: string; name: string }> = Array.isArray(
          data,
        )
          ? data.map((p: any) => ({
              id: String(p.id ?? p.name),
              name: p.name ?? String(p.id ?? ""),
            }))
          : [];

        if (!cancelled) {
          setProjectOptions(normalized);
        }
      } catch (err: any) {
        console.error("[ApplyWorkflowDialog] loadProjects error:", err);
        if (!cancelled) {
          setProjectsError(
            err?.message || "Failed to load projects for selection.",
          );
          setProjectOptions([]);
        }
      } finally {
        if (!cancelled) {
          setProjectsLoading(false);
        }
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [open, svc]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    // closeOnBackdropClick
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleApply = () => {
    if (!workflow) {
      onClose();
      return;
    }

    if (mode === "create") {
      console.log("[ApplyWorkflowDialog] apply workflow creating project", {
        workflowId: workflow.id,
        title: newProjectTitle,
        description: newProjectDescription,
      });
    } else {
      console.log("[ApplyWorkflowDialog] apply workflow to existing project", {
        workflowId: workflow.id,
        projectId: selectedProjectId || null,
      });
    }

    onClose();
  };

  if (!open || !workflow) return null;

  const applyDisabled =
    mode === "create"
      ? !newProjectTitle.trim()
      : !selectedProjectId || projectsLoading || !!projectsError;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* dialogCard */}
      <div className="relative z-10 w-full max-w-md min-h-[510px] max-h-[90vh] rounded-2xl bg-white dark:bg-slate-950 shadow-2xl border border-slate-200 dark:border-slate-800 px-6 pt-10 pb-5 flex flex-col">
        {/* topIcon */}
        <div className="absolute -top-7 left-1/2 -translate-x-1/2">
          <div className="h-12 w-12 rounded-full bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-700 flex items-center justify-center shadow-md">
            <ArrowRightCircle className="h-6 w-6 text-violet-600 dark:text-violet-300" />
          </div>
        </div>

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
          <div className="text-center mb-2">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
              Apply workflow
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {workflow.name}
            </p>
          </div>

          {/* tabs + form */}
          <div className="mt-3 flex-1 flex flex-col">
            {/* tabs */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-1 flex mt-2 mb-2">
              <button
                type="button"
                onClick={() => setMode("create")}
                className={[
                  "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  mode === "create"
                    ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 shadow-sm"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60",
                ].join(" ")}
              >
                Create new project
              </button>
              <button
                type="button"
                onClick={() => setMode("select")}
                className={[
                  "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  mode === "select"
                    ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 shadow-sm"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60",
                ].join(" ")}
              >
                Select project
              </button>
            </div>

            {/* formContent */}
            <div className="mt-4 space-y-4 text-sm flex-1 mb-2">
              {mode === "create" ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      New project title
                    </label>
                    <input
                      type="text"
                      value={newProjectTitle}
                      onChange={(e) => setNewProjectTitle(e.target.value)}
                      placeholder="Enter a title"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-inner focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      Project description
                    </label>
                    <textarea
                      rows={4}
                      value={newProjectDescription}
                      onChange={(e) =>
                        setNewProjectDescription(e.target.value)
                      }
                      placeholder="Optional description for this project"
                      className="w-full resize-none rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-inner focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      A new Scipion project will be created and this workflow
                      will be applied to it.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      Project
                    </label>
                    <select
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-inner focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                      disabled={projectsLoading || !!projectsError}
                    >
                      <option value="">
                        {projectsLoading
                          ? "Loading projects…"
                          : projectsError
                          ? "Could not load projects"
                          : "Select a project"}
                      </option>
                      {!projectsLoading &&
                        !projectsError &&
                        projectOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    {projectsError ? (
                      <p className="text-xs text-red-500">
                        {projectsError}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        The workflow will be applied inside the selected
                        existing project.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* actions */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-w-[96px] items-center justify-center rounded-md border border-red-500 px-4 py-2 text-sm font-medium text-red-600 bg-white hover:bg-red-50 dark:bg-slate-950 dark:hover:bg-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applyDisabled}
            className="inline-flex min-w-[96px] items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
