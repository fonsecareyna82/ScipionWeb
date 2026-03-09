import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCw, Search, X } from "lucide-react";
import toast from "react-hot-toast";

import { useProjectService } from "@/ProjectServiceContext";
import type { ProjectWorkflow } from "@/components/projects/workflows-panel";

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

function CardShell(props: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
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

function StatPill(props: { label: string; value: React.ReactNode; accent?: "indigo" | "sky" | "cyan" }) {
  return (
    <div
      className={classNames(
        crispText,
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium",
        "border-gray-300/80 bg-white text-gray-900",
        "dark:border-gray-700 dark:bg-slate-900 dark:text-white",
      )}
    >
      <span className="text-gray-700 dark:text-gray-300">{props.label}</span>
      <span className="font-semibold">{props.value}</span>
    </div>
  );
}

function PrimaryButton(props: {
  children: React.ReactNode;
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
  children: React.ReactNode;
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
        "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
        "border-gray-300/80 bg-white text-gray-900 shadow-sm hover:border-gray-400 hover:shadow-md",
        "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:border-gray-600",
        "disabled:cursor-not-allowed disabled:opacity-60",
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

export default function WorkflowsPage() {
  const svc = useProjectService();

  const [workflows, setWorkflows] = useState<ProjectWorkflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedWorkflow, setSelectedWorkflow] = useState<ProjectWorkflow | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const data = await svc.fetchWorkflows();

      const normalized: ProjectWorkflow[] = Array.isArray(data)
        ? data.map((wf: any) => ({
            id: String(wf.id ?? wf.name),
            name: wf.name ?? String(wf.id ?? ""),
            description: wf.description ?? "",
          }))
        : [];

      normalized.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

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
    void loadWorkflows();
  }, [loadWorkflows]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredWorkflows = useMemo(() => {
    if (!normalizedSearch) return workflows;
    return workflows.filter((wf) => (wf.name ?? "").toLowerCase().includes(normalizedSearch));
  }, [workflows, normalizedSearch]);

  const hasAnyWorkflows = workflows.length > 0;
  const hasFilteredWorkflows = filteredWorkflows.length > 0;

  const stats = useMemo(() => {
    return {
      total: workflows.length,
      shown: filteredWorkflows.length,
      selected: selectedWorkflow ? 1 : 0,
    };
  }, [filteredWorkflows.length, selectedWorkflow, workflows.length]);

  const openApply = useCallback((wf: ProjectWorkflow) => {
    setSelectedWorkflow(wf);
    setApplyDialogOpen(true);
  }, []);

  const onRowClick = useCallback((wf: ProjectWorkflow) => {
    setSelectedWorkflow(wf);
  }, []);

  const onRowDoubleClick = useCallback(
    (wf: ProjectWorkflow) => {
      openApply(wf);
    },
    [openApply],
  );

  return (
    <div className={classNames(crispText, "h-app min-h-0 flex flex-col px-2 py-2")}>
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 xl:col-span-8">
          <CardShell
            title="Workflows"
            subtitle="Browse templates and load them into a project."
            right={
              <SecondaryButton onClick={() => void loadWorkflows()} disabled={loading} title="Reload workflows">
                <RefreshCw className={classNames("h-4 w-4", loading ? "animate-spin" : "")} />
                Refresh
              </SecondaryButton>
            }
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-[420px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search workflow…"
                  className={classNames(
                    crispText,
                    "w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm font-medium outline-none transition",
                    "border-gray-300/80 bg-white text-gray-950 placeholder:text-gray-400",
                    "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                    "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-gray-500",
                    "dark:focus:border-indigo-400/40 dark:focus:ring-indigo-400/15",
                  )}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatPill label="Total" value={stats.total} />
                <StatPill label="Shown" value={stats.shown} />
                {selectedWorkflow ? (
                  <StatPill label="Selected" value={(selectedWorkflow.name ?? "").slice(0, 18)} />
                ) : null}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-300/90 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-900">
              <div
                className={classNames(
                  crispText,
                  "grid grid-cols-12 gap-3 border-b px-4 py-3.5",
                  "border-gray-300/80 bg-gray-100 text-gray-800",
                  "dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200",
                )}
              >
                <div className="col-span-4 text-sm font-semibold tracking-[0.01em]">Workflow</div>
                <div className="col-span-6 hidden text-sm font-semibold tracking-[0.01em] md:block">Description</div>
                <div className="col-span-8 text-right text-sm font-semibold tracking-[0.01em] md:col-span-2">Action</div>
              </div>

              <div className="max-h-[62vh] overflow-y-auto divide-y divide-gray-200/90 dark:divide-gray-700">
                {loading ? (
                  <div className="px-4 py-4 text-sm leading-6 text-gray-700 dark:text-gray-200">
                    Loading workflows…
                  </div>
                ) : errorMessage ? (
                  <div className="px-4 py-4 text-sm leading-6 text-red-600 dark:text-red-300">{errorMessage}</div>
                ) : !hasAnyWorkflows ? (
                  <div className="px-4 py-4 text-sm leading-6 text-gray-700 dark:text-gray-300">
                    No workflows defined yet.
                  </div>
                ) : !hasFilteredWorkflows ? (
                  <div className="px-4 py-4 text-sm leading-6 text-gray-700 dark:text-gray-300">
                    No workflows found matching your search.
                  </div>
                ) : (
                  filteredWorkflows.map((wf) => {
                    const isSelected = selectedWorkflow && String(selectedWorkflow.id) === String(wf.id);

                    return (
                      <div
                        key={wf.id}
                        className={classNames(
                          "grid grid-cols-12 gap-3 px-4 py-3.5 transition",
                          "hover:bg-gray-50 dark:hover:bg-slate-800/70",
                          isSelected ? "bg-gray-100 dark:bg-slate-800" : "",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onRowClick(wf)}
                          onDoubleClick={() => onRowDoubleClick(wf)}
                          className="col-span-4 min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
                          title="Click to select, double-click to load"
                        >
                          <div
                            className="truncate text-[15px] font-medium leading-6 text-gray-950 dark:text-white"
                            title={wf.name}
                          >
                            {wf.name}
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm leading-6 text-gray-700 dark:text-gray-300 md:hidden">
                            {wf.description || "—"}
                          </div>
                        </button>

                        <div className="col-span-6 hidden md:block">
                          <div className="line-clamp-2 whitespace-pre-line text-sm leading-6 text-gray-800 dark:text-gray-200">
                            {wf.description || "—"}
                          </div>
                        </div>

                        <div className="col-span-8 flex items-center justify-end md:col-span-2">
                          <PrimaryButton
                            onClick={() => openApply(wf)}
                            className="px-3 py-2 text-xs"
                            title="Load this workflow"
                          >
                            Load
                            <ArrowRight className="h-4 w-4" />
                          </PrimaryButton>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300">
              Tip: double-click a workflow row to load it.
            </div>
          </CardShell>
        </div>

        <div className="col-span-12 xl:col-span-4">
          <CardShell
            title="Details"
            subtitle={selectedWorkflow ? "Selected workflow overview." : "Select a workflow to preview it."}
          >
            {!selectedWorkflow ? (
              <div className="rounded-2xl border border-gray-300/80 bg-white p-4 text-sm leading-6 text-gray-700 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200">
                No workflow selected.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-gray-300/80 bg-white p-4 dark:border-gray-700 dark:bg-slate-900">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Name</div>
                  <div className="mt-1 text-[15px] font-medium leading-6 text-gray-950 dark:text-white">
                    {selectedWorkflow.name}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-300/80 bg-white p-4 dark:border-gray-700 dark:bg-slate-900">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</div>
                  <div className="mt-1 whitespace-pre-line text-sm leading-6 text-gray-800 dark:text-gray-200">
                    {selectedWorkflow.description || "—"}
                  </div>
                </div>

                <PrimaryButton onClick={() => openApply(selectedWorkflow)} className="w-full">
                  Load workflow
                  <ArrowRight className="h-4 w-4" />
                </PrimaryButton>
              </div>
            )}
          </CardShell>
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

function ApplyWorkflowDialog({ open, workflow, onClose }: ApplyWorkflowDialogProps) {
  const svc = useProjectService();

  const [mode, setMode] = useState<ApplyWorkflowMode>("create");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");

  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string }>>([]);
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
        const normalized: Array<{ id: string; name: string }> = Array.isArray(data)
          ? data.map((p: any) => ({
              id: String(p.id ?? p.name),
              name: p.name ?? String(p.id ?? ""),
            }))
          : [];

        if (!cancelled) setProjectOptions(normalized);
      } catch (err: any) {
        console.error("[ApplyWorkflowDialog] loadProjects error:", err);
        if (!cancelled) {
          setProjectsError(err?.message || "Failed to load projects for selection.");
          setProjectOptions([]);
        }
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [open, svc]);

  const handleApply = useCallback(async () => {
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

        targetProjectName = createdProject?.name ?? createdProject?.project?.name ?? payload.name;

        if (!targetProjectId) throw new Error("Project id not returned by backend.");
      } else {
        if (!selectedProjectId) throw new Error("No project selected.");

        targetProjectId = selectedProjectId;
        const match = projectOptions.find((p) => String(p.id) === String(selectedProjectId));
        targetProjectName = match?.name ?? selectedProjectId;
      }

      await svc.loadWorkflow(targetProjectId, { workflowId: String(workflow.id) });

      toast.success(`Workflow "${workflow.name}" applied to project "${targetProjectName}".`);
      onClose();
    } catch (err: any) {
      console.error("[ApplyWorkflowDialog] handleApply error:", err);
      setSubmitError(err?.message || "Failed to apply workflow. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [mode, newProjectDescription, newProjectTitle, onClose, projectOptions, selectedProjectId, svc, workflow]);

  if (!open || !workflow) return null;

  const applyDisabled =
    submitting ||
    (mode === "create"
      ? !newProjectTitle.trim()
      : !selectedProjectId || projectsLoading || !!projectsError);

  return (
    <div
      className={classNames(
        crispText,
        "fixed inset-0 z-[90] flex items-center justify-center",
        "bg-black/[0.02] dark:bg-white/[0.02]",
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={classNames(
          "relative z-10 w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl",
          "min-h-[520px] max-h-[520px]",
          "border-gray-300/90 bg-white",
          "ring-1 ring-inset ring-black/[0.10]",
          "dark:border-gray-600 dark:bg-slate-900 dark:ring-white/[0.10]",
        )}
      >
        <div className="relative flex h-full flex-col px-6 pt-6 pb-5">
          <button
            type="button"
            onClick={onClose}
            className={classNames(
              "absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border transition",
              "border-gray-300/80 bg-white text-gray-800 hover:shadow-sm",
              "dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200",
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-[0.01em] text-gray-950 dark:text-white">Load workflow</h2>
            <p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">{workflow.name}</p>
          </div>

          <div className="rounded-xl border border-gray-300/80 bg-white p-1 dark:border-gray-700 dark:bg-slate-900">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setMode("create")}
                className={classNames(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  mode === "create"
                    ? "bg-gray-100 text-gray-950 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-800/60",
                )}
              >
                Create new
              </button>
              <button
                type="button"
                onClick={() => setMode("select")}
                className={classNames(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  mode === "select"
                    ? "bg-gray-100 text-gray-950 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-800/60",
                )}
              >
                Select project
              </button>
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1">
            <div className="mt-4 min-h-0 flex-1">
              {mode === "create" ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-200">New project name</label>
                    <input
                      type="text"
                      value={newProjectTitle}
                      onChange={(e) => setNewProjectTitle(e.target.value)}
                      placeholder="Enter a title"
                      className={classNames(
                        crispText,
                        "w-full rounded-xl border px-3 py-2.5 text-sm font-medium outline-none transition",
                        "border-gray-300/80 bg-white text-gray-950 placeholder:text-gray-400",
                        "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                        "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-gray-500",
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-200">Project description</label>
                    <textarea
                      rows={4}
                      value={newProjectDescription}
                      onChange={(e) => setNewProjectDescription(e.target.value)}
                      placeholder="Optional description for this project"
                      className={classNames(
                        crispText,
                        "w-full resize-none rounded-xl border px-3 py-2.5 text-sm leading-6 text-gray-900 outline-none transition placeholder:text-gray-400",
                        "border-gray-300/80 bg-white",
                        "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                        "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-gray-500",
                      )}
                    />
                    <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
                      A new project will be created and this workflow will be loaded into it.
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 dark:text-gray-200">Project</label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className={classNames(
                      crispText,
                      "w-full rounded-xl border px-3 py-2.5 text-sm font-medium outline-none transition",
                      "border-gray-300/80 bg-white text-gray-950",
                      "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                      "dark:border-gray-700 dark:bg-slate-900 dark:text-white",
                    )}
                    disabled={projectsLoading || !!projectsError}
                  >
                    <option value="">
                      {projectsLoading ? "Loading projects…" : projectsError ? "Could not load projects" : "Select a project"}
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
                    <p className="text-sm leading-6 text-red-600 dark:text-red-300">{projectsError}</p>
                  ) : (
                    <p className="text-sm leading-6 text-gray-700 dark:text-gray-300 mb-43">
                      The workflow will be loaded inside the selected existing project.
                    </p>
                  )}
                </div>
              )}

              {submitError ? <div className="text-sm leading-6 text-red-600 dark:text-red-300">{submitError}</div> : null}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <SecondaryButton onClick={onClose} disabled={submitting} className="min-w-[110px]">
              Cancel
            </SecondaryButton>

            <PrimaryButton onClick={() => void handleApply()} disabled={applyDisabled} className="min-w-[110px]">
              {submitting ? "Loading…" : "Load"}
              <ArrowRight className="h-4 w-4" />
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}