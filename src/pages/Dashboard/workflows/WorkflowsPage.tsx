import { useCallback, useEffect, useState } from "react";
import { RefreshCw, X, Search } from "lucide-react";
import toast from "react-hot-toast";

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

  const [searchTerm, setSearchTerm] = useState("");

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

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredWorkflows =
    normalizedSearch === ""
      ? workflows
      : workflows.filter((wf) =>
          wf.name.toLowerCase().includes(normalizedSearch),
        );

  const hasAnyWorkflows = workflows.length > 0;
  const hasFilteredWorkflows = filteredWorkflows.length > 0;

  return (
    <div className="h-app min-h-0 flex flex-col px-2 py-1">
      {/* headerSection */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1">
          <h1 className="text-xl text-gray-900 dark:text-gray-50">
            Workflows
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <div className="relative w-80 max-w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search workflow..."
                className="w-full rounded-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-8 pr-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
              />
            </div>
          </div>
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

            {!loading && !errorMessage && !hasAnyWorkflows && (
              <div className="px-4 py-4 text-base text-gray-500 dark:text-gray-400">
                No workflows defined yet.
              </div>
            )}

            {!loading &&
              !errorMessage &&
              hasAnyWorkflows &&
              !hasFilteredWorkflows && (
                <div className="px-4 py-4 text-base text-gray-500 dark:text-gray-400">
                  No workflows found matching your search.
                </div>
              )}

            {!loading &&
              !errorMessage &&
              hasFilteredWorkflows &&
              filteredWorkflows.map((wf) => (
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

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open && workflow) {
      setMode("create");
      setNewProjectTitle(workflow.name ?? "");
      setNewProjectDescription(workflow.description ?? "");
      setSelectedProjectId("");
      setSubmitError(null);
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

  const handleApply = async () => {
    if (!workflow) {
      onClose();
      return;
    }

    setSubmitError(null);
    setSubmitting(true);

    try {
      let targetProjectId: string | number | undefined;
      let targetProjectName: string | undefined;

      if (mode === "create") {
        const payload = {
          name: newProjectTitle.trim(),
          description: newProjectDescription.trim() || undefined,
        };

        const createdProject: any = await svc.createProject(payload);

        targetProjectId =
          createdProject?.id ??
          createdProject?.projectId ??
          createdProject?.project?.id ??
          createdProject?.data?.id;

        targetProjectName =
          createdProject?.name ??
          createdProject?.project?.name ??
          payload.name;

        if (!targetProjectId) {
          throw new Error("Project id not returned by backend.");
        }
      } else {
        if (!selectedProjectId) {
          throw new Error("No project selected.");
        }
        targetProjectId = selectedProjectId;

        const match = projectOptions.find(
          (p) => String(p.id) === String(selectedProjectId),
        );
        targetProjectName = match?.name ?? selectedProjectId;
      }

      await svc.applyWorkflowToProject(targetProjectId, {
        workflowId: String(workflow.id),
      });

      toast.success(
        `Workflow "${workflow.name}" applied to project "${targetProjectName}".`,
      );

      onClose();
    } catch (err: any) {
      console.error("[ApplyWorkflowDialog] handleApply error:", err);
      setSubmitError(
        err?.message || "Failed to apply workflow. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !workflow) return null;

  const applyDisabled =
    submitting ||
    (mode === "create"
      ? !newProjectTitle.trim()
      : !selectedProjectId || projectsLoading || !!projectsError);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      {/* dialogCard */}
      <div className="relative z-10 w-full max-w-md min-h-[510px] max-h-[90vh] rounded-2xl bg-gray-100 dark:bg-slate-950 shadow-2xl border border-slate-200 dark:border-slate-800 px-6 pt-10 pb-5 flex flex-col">
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

              {submitError && (
                <div className="pt-1 text-xs text-red-500">{submitError}</div>
              )}
            </div>
          </div>
        </div>

        {/* actions */}
        <div className="mt-6 flex items-center justify-between gap-3">
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
